import "./Dashboard.css";

function Dashboard() {
  return (
    <div className="dashboard-container">
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: 'bold',
          color: '#1e293b',
          marginBottom: '1rem'
        }}>
          Coming Soon
        </h1>
        <p style={{
          fontSize: '1.25rem',
          color: '#64748b',
          maxWidth: '600px'
        }}>
          The Sales Dashboard is currently under development. Check back soon for key metrics and performance insights.
        </p>
      </div>
    </div>
  );
}

export default Dashboard;