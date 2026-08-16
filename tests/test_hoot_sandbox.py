"""Adversarial behavioral tests for Hoot's sandbox-only reversible executor."""

from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from src.nexus.hoot_sandbox import (
    SandboxExecutionError,
    execute_sandbox_write,
    rollback_sandbox_write,
)


def mission(**overrides):
    value = {
        "mission_id": "mission-sandbox-001",
        "agent": "Hoot",
        "requested_capabilities": ["write_sandbox_artifact"],
    }
    value.update(overrides)
    return value


def allow_route(**overrides):
    value = {
        "decision": "ALLOW",
        "mission_id": "mission-sandbox-001",
        "agent": "Hoot",
        "reason_codes": [],
    }
    value.update(overrides)
    return value


class HootSandboxTests(unittest.TestCase):
    def assert_denied(self, expected_code, fn):
        with self.assertRaises(SandboxExecutionError) as ctx:
            fn()
        self.assertEqual(str(ctx.exception), expected_code)

    def test_denied_router_result_cannot_write(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "artifact.txt"
            self.assert_denied(
                "DENY_ROUTER_DECISION",
                lambda: execute_sandbox_write(
                    mission(),
                    allow_route(decision="DENY"),
                    sandbox_root=tmp,
                    relative_path="artifact.txt",
                    content="blocked",
                ),
            )
            self.assertFalse(target.exists())

    def test_route_mission_mismatch_cannot_write(self):
        with TemporaryDirectory() as tmp:
            self.assert_denied(
                "DENY_ROUTE_MISSION_MISMATCH",
                lambda: execute_sandbox_write(
                    mission(),
                    allow_route(mission_id="other"),
                    sandbox_root=tmp,
                    relative_path="artifact.txt",
                    content="blocked",
                ),
            )

    def test_route_agent_mismatch_cannot_write(self):
        with TemporaryDirectory() as tmp:
            self.assert_denied(
                "DENY_ROUTE_AGENT_MISMATCH",
                lambda: execute_sandbox_write(
                    mission(),
                    allow_route(agent="Nova"),
                    sandbox_root=tmp,
                    relative_path="artifact.txt",
                    content="blocked",
                ),
            )

    def test_missing_capability_cannot_write(self):
        with TemporaryDirectory() as tmp:
            self.assert_denied(
                "DENY_CAPABILITY",
                lambda: execute_sandbox_write(
                    mission(requested_capabilities=[]),
                    allow_route(),
                    sandbox_root=tmp,
                    relative_path="artifact.txt",
                    content="blocked",
                ),
            )

    def test_parent_escape_is_rejected(self):
        with TemporaryDirectory() as tmp:
            self.assert_denied(
                "DENY_PATH_ESCAPE",
                lambda: execute_sandbox_write(
                    mission(),
                    allow_route(),
                    sandbox_root=tmp,
                    relative_path="../escape.txt",
                    content="blocked",
                ),
            )

    def test_absolute_path_escape_is_rejected(self):
        with TemporaryDirectory() as tmp, TemporaryDirectory() as outside:
            target = str(Path(outside) / "escape.txt")
            self.assert_denied(
                "DENY_PATH_ESCAPE",
                lambda: execute_sandbox_write(
                    mission(),
                    allow_route(),
                    sandbox_root=tmp,
                    relative_path=target,
                    content="blocked",
                ),
            )

    def test_successful_write_records_digest_and_readback(self):
        with TemporaryDirectory() as tmp:
            payload = "verified artifact\n"
            receipt = execute_sandbox_write(
                mission(),
                allow_route(),
                sandbox_root=tmp,
                relative_path="nested/artifact.txt",
                content=payload,
            )
            target = Path(tmp) / "nested" / "artifact.txt"
            self.assertEqual(target.read_text(encoding="utf-8"), payload)
            self.assertEqual(receipt.after_sha256, sha256(payload.encode("utf-8")).hexdigest())
            self.assertEqual(receipt.bytes_written, len(payload.encode("utf-8")))
            self.assertFalse(receipt.existed_before)
            self.assertIsNone(receipt.before_bytes)

    def test_overwrite_rollback_restores_exact_prior_bytes(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "artifact.bin"
            prior = b"\x00prior\xffbytes"
            target.write_bytes(prior)
            receipt = execute_sandbox_write(
                mission(),
                allow_route(),
                sandbox_root=tmp,
                relative_path="artifact.bin",
                content="replacement",
            )
            self.assertNotEqual(target.read_bytes(), prior)
            rollback_sandbox_write(receipt, sandbox_root=tmp)
            self.assertEqual(target.read_bytes(), prior)

    def test_new_file_rollback_deletes_created_file(self):
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "artifact.txt"
            receipt = execute_sandbox_write(
                mission(),
                allow_route(),
                sandbox_root=tmp,
                relative_path="artifact.txt",
                content="temporary",
            )
            self.assertTrue(target.exists())
            rollback_sandbox_write(receipt, sandbox_root=tmp)
            self.assertFalse(target.exists())

    def test_non_file_target_is_rejected(self):
        with TemporaryDirectory() as tmp:
            (Path(tmp) / "directory").mkdir()
            self.assert_denied(
                "DENY_NON_FILE_TARGET",
                lambda: execute_sandbox_write(
                    mission(),
                    allow_route(),
                    sandbox_root=tmp,
                    relative_path="directory",
                    content="blocked",
                ),
            )

    def test_rollback_rejects_different_sandbox_root(self):
        with TemporaryDirectory() as tmp, TemporaryDirectory() as other:
            receipt = execute_sandbox_write(
                mission(),
                allow_route(),
                sandbox_root=tmp,
                relative_path="artifact.txt",
                content="temporary",
            )
            self.assert_denied(
                "DENY_RECEIPT_PATH_MISMATCH",
                lambda: rollback_sandbox_write(receipt, sandbox_root=other),
            )
            self.assertTrue((Path(tmp) / "artifact.txt").exists())


if __name__ == "__main__":
    unittest.main()
