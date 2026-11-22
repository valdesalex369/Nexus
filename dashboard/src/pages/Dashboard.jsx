export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <div className="card-grid">
        <div className="card">
          <h3>Active Agents</h3>
          <p className="stat">0</p>
        </div>
        <div className="card">
          <h3>Scheduled Posts</h3>
          <p className="stat">0</p>
        </div>
        <div className="card">
          <h3>Platforms Connected</h3>
          <p className="stat">0</p>
        </div>
      </div>
    </div>
  );
}
