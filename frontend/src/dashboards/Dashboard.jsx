import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import "./Dashboard.css";

function Dashboard() {
  // State for loading indicator
  const [loading, setLoading] = useState(true);
  // State for all dashboard chart and card data
  const [chartData, setChartData] = useState({});

  // State for filter dropdowns above the YTD sales chart
  const [filters, setFilters] = useState({
    company: 'All',
    doctor: 'All',
    rep: 'All',
    region: 'All',
    facility: 'All',
  });

  // Month labels for charts
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Index for the current month (July)
  const currentMonthIndex = 6;

  // Mock data fetch for dashboard metrics and charts
  useEffect(() => {
    setTimeout(() => {
      setChartData({
        revenueData: [
          { month: 'Jan', revenue: 45000 },
          { month: 'Feb', revenue: 52000 },
          { month: 'Mar', revenue: 48000 },
          { month: 'Apr', revenue: 61000 },
          { month: 'May', revenue: 55000 },
          { month: 'Jun', revenue: 67000 }
        ],
        orderStatus: [
          { status: 'Completed', count: 156, percentage: 65 },
          { status: 'Pending', count: 45, percentage: 19 },
          { status: 'Processing', count: 23, percentage: 10 },
          { status: 'Cancelled', count: 15, percentage: 6 }
        ],
        topProducts: [
          { name: 'Product A', sales: 234, revenue: 12500 },
          { name: 'Product B', sales: 189, revenue: 9800 },
          { name: 'Product C', sales: 156, revenue: 8700 },
          { name: 'Product D', sales: 134, revenue: 7200 },
          { name: 'Product E', sales: 98, revenue: 5400 }
        ],
        inventoryAlerts: [
          { product: 'Product A', current: 15, min: 20, status: 'low' },
          { product: 'Product B', current: 8, min: 10, status: 'critical' },
          { product: 'Product C', current: 45, min: 30, status: 'good' },
          { product: 'Product D', current: 12, min: 15, status: 'low' }
        ]
      });
      setLoading(false);
    }, 1000);
  }, []);

  // Helper to get color for order status
  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return '#2563eb'; // blue-600
      case 'Pending': return '#f59e42'; // orange-400
      case 'Processing': return '#3b82f6'; // blue-500
      case 'Cancelled': return '#ef4444'; // red-500
      default: return '#64748b'; // gray-500
    }
  };

  // Helper to get color for inventory status
  const getInventoryColor = (status) => {
    switch (status) {
      case 'critical': return '#ef4444';
      case 'low': return '#f59e42';
      case 'good': return '#22c55e';
      default: return '#64748b';
    }
  };

  // Data for YTD sales line chart (2025 fades after July, 2024 is full year)
  const ytd2025 = [45000, 52000, 48000, 61000, 55000, 67000, 70000, null, null, null, null, null];
  const ytd2024 = [40000, 48000, 42000, 57000, 50000, 60000, 63000, 65000, 67000, 69000, 71000, 73000];

  // ECharts options for YTD Sales
  const ytdSalesOption = {
    tooltip: { trigger: 'axis', valueFormatter: (value) => `$${(value/1000).toFixed(1)}k` },
    legend: { data: ['2025 YTD Sales', '2024 YTD Sales'], top: 10 },
    grid: { left: 40, right: 20, top: 60, bottom: 40 },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { fontSize: 14 }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: value => `$${value / 1000}k`,
        fontSize: 14
      },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: [
      {
        name: '2025 YTD Sales',
        type: 'line',
        data: ytd2025,
        smooth: true,
        symbolSize: 12,
        itemStyle: { color: '#6366F1' },
        lineStyle: { width: 4, color: '#6366F1' },
        areaStyle: { color: 'rgba(99,102,241,0.10)' },
        emphasis: { focus: 'series' },
        connectNulls: false
      },
      {
        name: '2024 YTD Sales',
        type: 'line',
        data: ytd2024,
        smooth: true,
        symbolSize: 8,
        itemStyle: { color: '#F59E42' },
        lineStyle: { width: 3, color: '#F59E42', type: 'dashed' },
        areaStyle: { color: 'rgba(245,158,66,0.08)' },
        emphasis: { focus: 'series' }
      }
    ]
  };

  // ECharts options for Order Status Doughnut
  const orderStatusOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 30,
      itemWidth: 16,
      itemHeight: 16,
      textStyle: { fontSize: 14 }
    },
    series: [
      {
        name: 'Order Status',
        type: 'pie',
        radius: ['55%', '80%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
        labelLine: { show: false },
        data: chartData.orderStatus?.map(item => ({
          value: item.count,
          name: item.status,
          itemStyle: { color: getStatusColor(item.status) }
        }))
      }
    ]
  };

  // Show loading spinner while fetching data
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p className="loading-text">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Sales Dashboard</h1>
          <p className="dashboard-subtitle">Key metrics and performance insights</p>
        </div>
        <div className="dashboard-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <h3 className="kpi-label">Total Revenue</h3>
          <span className="kpi-value">$328,000</span>
          <span className="kpi-trend">+12.5% vs last month</span>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">Total Orders</h3>
          <span className="kpi-value">1,234</span>
          <span className="kpi-trend">+8.2% vs last month</span>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">Average Order Value</h3>
          <span className="kpi-value">$265.80</span>
          <span className="kpi-trend">+3.1% vs last month</span>
        </div>
        <div className="kpi-card">
          <h3 className="kpi-label">Customer Satisfaction</h3>
          <span className="kpi-value">4.8/5.0</span>
          <span className="kpi-trend">+0.2 vs last month</span>
        </div>
      </div>

      {/* Filters Bar for YTD Sales */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">Company:</label>
          <select className="filter-select" value={filters.company} onChange={e => setFilters(f => ({ ...f, company: e.target.value }))}>
            <option>All</option>
            <option>Company Alpha</option>
            <option>Company Beta</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Doctor:</label>
          <select className="filter-select" value={filters.doctor} onChange={e => setFilters(f => ({ ...f, doctor: e.target.value }))}>
            <option>All</option>
            <option>Dr. Smith</option>
            <option>Dr. Lee</option>
            <option>Dr. Patel</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Rep:</label>
          <select className="filter-select" value={filters.rep} onChange={e => setFilters(f => ({ ...f, rep: e.target.value }))}>
            <option>All</option>
            <option>Rep A</option>
            <option>Rep B</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Region:</label>
          <select className="filter-select" value={filters.region} onChange={e => setFilters(f => ({ ...f, region: e.target.value }))}>
            <option>All</option>
            <option>North</option>
            <option>South</option>
            <option>East</option>
            <option>West</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Facility:</label>
          <select className="filter-select" value={filters.facility} onChange={e => setFilters(f => ({ ...f, facility: e.target.value }))}>
            <option>All</option>
            <option>Facility X</option>
            <option>Facility Y</option>
          </select>
        </div>
      </div>

      {/* Main charts grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 px-2">
        {/* YTD Sales line chart (main focus) */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 mb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Year-to-Date Sales vs Last Year</h2>
          </div>
          <div className="h-80 w-full">
            <ReactECharts option={ytdSalesOption} style={{ height: 320, width: '100%' }} />
          </div>
        </div>

        {/* Order Status Distribution (Doughnut) */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Order Status Distribution</h3>
          </div>
          <div className="h-64 w-full">
            <ReactECharts option={orderStatusOption} style={{ height: 220, width: '100%' }} />
          </div>
        </div>

        {/* Top Performing Products */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Top Performing Products</h3>
          </div>
          <div className="products-list">
            {chartData.topProducts?.map((product, index) => (
              <div key={index} className="product-item">
                <span className="product-rank">#{index + 1}</span>
                <span className="product-name">{product.name}</span>
                <div className="product-stats">
                  <span className="product-units">{product.sales} units</span>
                  <span className="product-revenue">${product.revenue.toLocaleString()}</span>
                </div>
                <div className="product-progress">
                  <div className="product-progress-bar" style={{ width: `${(product.revenue / 12500) * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inventory Alerts */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Inventory Alerts</h3>
            <button className="chart-title" style={{ fontSize: '0.875rem', color: '#1e3a8a', fontWeight: '600', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer' }}>View All Products</button>
          </div>
          <div className="alerts-grid">
            {chartData.inventoryAlerts?.map((alert, index) => (
              <div key={index} className="alert-card">
                <div className="alert-header">
                  <span className="alert-product">{alert.product}</span>
                  <span className={`alert-status ${alert.status}`}>{alert.status}</span>
                </div>
                <div className="alert-stats">
                  <span>Current: {alert.current}</span>
                  <span>Min: {alert.min}</span>
                </div>
                <div className="alert-progress">
                  <div className={`alert-progress-bar ${alert.status}`} style={{ width: `${Math.min((alert.current / alert.min) * 100, 100)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;