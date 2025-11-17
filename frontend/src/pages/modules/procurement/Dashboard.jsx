import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import './ProcurementDashboard.css';

// Helper to format currency
const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '$0';
  const numericValue = Number(value) || 0;
  return numericValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
};

// Reusable KPI Card
const KpiCard = ({ title, value, subValue, icon, color }) => (
  <div className="po-kpi-card">
    <div className="po-kpi-icon" style={{ backgroundColor: color }}>
      {icon}
    </div>
    <div className="po-kpi-content">
      <h4 className="po-kpi-title">{title}</h4>
      <span className="po-kpi-value">{value}</span>
      {subValue && <p className="po-kpi-subvalue">{subValue}</p>}
    </div>
  </div>
);

function POsDashboard() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('last_30_days');

  // State for the 3 key metrics
  const [pendingApprovalPOs, setPendingApprovalPOs] = useState({ count: 0, value: 0, list: [] });
  const [pendingReceiptPOs, setPendingReceiptPOs] = useState({ count: 0, list: [] });
  const [partialReceiptPOs, setPartialReceiptPOs] = useState({ count: 0, list: [] });

  // Helper to get auth token
  const getAuthToken = () => {
    return localStorage.getItem('auth_token');
  };

  useEffect(() => {
    const normalizePoPayload = (payload) => {
      if (!payload) return { list: [], count: 0 };

      const candidates = [
        payload,
        payload?.data,
        payload?.results,
        payload?.purchase_orders,
        payload?.items,
        payload?.rows,
        payload?.data?.rows,
      ];

      const list = candidates.find((candidate) => Array.isArray(candidate)) || [];
      const count =
        payload?.pagination?.total ??
        payload?.total ??
        payload?.count ??
        list.length;

      return { list, count };
    };

    const fetchBucket = async (statuses = []) => {
      const params = new URLSearchParams({
        limit: '10',
        offset: '0',
      });

      if (statuses.length) {
        params.set('status', statuses.join(','));
      }

      // Backend currently ignores this, but keeping it makes the query explicit.
      params.set('date_range', dateRange);

      const url = `/api/procurement/purchase_orders?${params.toString()}`;
      console.log('Fetching PO data from:', url);

      const authToken = getAuthToken();
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const message = await response.text();
        console.error('Failed to fetch PO data:', message);
        throw new Error(message || 'Failed to load purchase orders');
      }

      const payload = await response.json();
      console.log('Received payload for statuses', statuses, ':', payload);
      const normalized = normalizePoPayload(payload);
      console.log('Normalized data:', normalized);
      return normalized;
    };

    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // First, check if there's any data at all
        const authToken = getAuthToken();
        const allPOsResponse = await fetch('/api/procurement/purchase_orders?limit=100&offset=0', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (allPOsResponse.ok) {
          const allPOsData = await allPOsResponse.json();
          console.log('Total POs in database:', allPOsData);

          // Log unique statuses found
          const allPOs = normalizePoPayload(allPOsData);
          const statuses = new Set(allPOs.list.map(po => po.status));
          console.log('Available statuses in database:', Array.from(statuses));
          console.log('Sample PO:', allPOs.list[0]);
        }

        // Fetch all three metrics in parallel using the live API data
        const [pendingApproval, pendingReceipt, partialReceipt] = await Promise.all([
          fetchBucket(['draft', 'pending']),
          fetchBucket(['sent_to_supplier']),
          fetchBucket(['partial']),
        ]);

        const approvalValue = pendingApproval.list.reduce(
          (sum, po) => sum + (Number(po.total_amount) || 0),
          0
        );

        console.log('Setting state with:', {
          pendingApproval: pendingApproval.count,
          pendingReceipt: pendingReceipt.count,
          partialReceipt: partialReceipt.count,
        });

        setPendingApprovalPOs({
          count: pendingApproval.count,
          value: approvalValue,
          list: pendingApproval.list.slice(0, 5),
        });

        setPendingReceiptPOs({
          count: pendingReceipt.count,
          list: pendingReceipt.list.slice(0, 5),
        });

        setPartialReceiptPOs({
          count: partialReceipt.count,
          list: partialReceipt.list.slice(0, 5),
        });

      } catch (error) {
        console.error('Failed to load PO dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [dateRange]);

  // Chart option for PO Status Overview
  const poStatusChartOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} POs ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 20,
      top: 'center',
      textStyle: { fontSize: 13 }
    },
    series: [
      {
        name: 'PO Status',
        type: 'pie',
        radius: ['55%', '80%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 3
        },
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        data: [
          { value: pendingApprovalPOs.count, name: 'Pending Approval', itemStyle: { color: '#f59e0b' } },
          { value: pendingReceiptPOs.count, name: 'Awaiting Receipt', itemStyle: { color: '#3b82f6' } },
          { value: partialReceiptPOs.count, name: 'Partial Receipt', itemStyle: { color: '#8b5cf6' } }
        ]
      }
    ]
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Calculate days since creation
  const getDaysOld = (primaryDate, fallbackDate) => {
    const dateString = primaryDate || fallbackDate;
    if (!dateString) return '';
    const created = new Date(dateString);
    const now = new Date();
    const days = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  };

  const getPoId = (po) =>
    po?.purchase_order_id ?? po?.id ?? po?.po_id ?? po?.poId ?? null;

  const getPoNumber = (po) => {
    const poId = getPoId(po);
    if (po?.po_number) return po.po_number;
    if (!poId) return 'PO';
    return `PO-${poId}`;
  };

  const getSupplierName = (po) =>
    po?.supplier_name || po?.supplier?.supplier_name || po?.supplier?.name || 'Unknown Supplier';

  const getExpectedDate = (po) =>
    po?.requested_delivery_date || po?.expected_date || po?.expected_delivery || '';

  const getPartialProgress = (po) => {
    const received =
      Number(po?.items_received) ||
      Number(po?.received_items) ||
      Number(po?.quantity_received) ||
      0;
    const total =
      Number(po?.total_items) ||
      Number(po?.item_count) ||
      Number(po?.total_line_items) ||
      Number(po?.lines_total) ||
      Number(po?.quantity_ordered) ||
      0;

    if (total > 0) {
      return `${received} of ${total} items`;
    }
    return 'Tracking receipts';
  };

  if (loading) {
    return (
      <div className="po-loading-container">
        <div className="po-loading-spinner"></div>
        <p className="po-loading-text">Loading PO Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="po-dashboard-container">
      
      {/* Header */}
      <div className="po-dashboard-header">
        <div>
          <h1 className="po-dashboard-title">Purchase Orders Dashboard</h1>
          <p className="po-dashboard-subtitle">Monitor and manage purchase order workflow</p>
        </div>
        <div className="po-date-filter">
          <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="last_90_days">Last 90 Days</option>
            <option value="year_to_date">Year to Date</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="po-kpi-grid">
        <KpiCard
          title="Pending Approval"
          value={pendingApprovalPOs.count}
          subValue={formatCurrency(pendingApprovalPOs.value)}
          color="#fef3c7"
          icon={
            <svg width="28" height="28" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="14" cy="14" r="12"/>
              <path d="M14 8v6M14 18h.01"/>
            </svg>
          }
        />
        
        <KpiCard
          title="Awaiting Receipt"
          value={pendingReceiptPOs.count}
          subValue="Purchase Orders"
          color="#dbeafe"
          icon={
            <svg width="28" height="28" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>
            </svg>
          }
        />
        
        <KpiCard
          title="Partial Receipt"
          value={partialReceiptPOs.count}
          subValue="In Progress"
          color="#ede9fe"
          icon={
            <svg width="28" height="28" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
              <path d="M20 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6"/>
            </svg>
          }
        />
      </div>

      {/* Main Content Grid */}
      <div className="po-main-grid">
        
        {/* PO Status Chart */}
        <div className="po-chart-card po-span-full">
          <h3 className="po-chart-title">PO Status Overview</h3>
          <div className="po-chart-container-small">
            <ReactECharts option={poStatusChartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Pending Approval List */}
        <div className="po-list-card">
          <h3 className="po-chart-title">
            Pending Approval
            <span className="po-count-badge po-badge-warning">{pendingApprovalPOs.count}</span>
          </h3>
          <ul className="po-action-list">
            {pendingApprovalPOs.list.length === 0 ? (
              <p className="po-empty-message">No POs pending approval</p>
            ) : (
              pendingApprovalPOs.list.map(po => {
                const poId = getPoId(po);
                const poNumber = getPoNumber(po);
                const supplierName = getSupplierName(po);
                const link = poId ? `/purchase-orders/${poId}` : '/purchase-orders';

                return (
                  <li key={poId || poNumber} className="po-list-item">
                    <div className="po-item-info">
                      <span className="po-item-id">
                        <a href={link}>
                          {poNumber}
                        </a>
                      </span>
                      <span className="po-item-supplier">{supplierName}</span>
                    </div>
                    <div className="po-item-details">
                      <span className="po-item-value">{formatCurrency(po.total_amount || po.subtotal)}</span>
                      <span className="po-item-age po-age-warning">
                        {getDaysOld(po.created_at, po.order_date)}
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Awaiting Receipt List */}
        <div className="po-list-card">
          <h3 className="po-chart-title">
            Awaiting Receipt
            <span className="po-count-badge po-badge-info">{pendingReceiptPOs.count}</span>
          </h3>
          <ul className="po-action-list">
            {pendingReceiptPOs.list.length === 0 ? (
              <p className="po-empty-message">No POs awaiting receipt</p>
            ) : (
              pendingReceiptPOs.list.map(po => {
                const poId = getPoId(po);
                const poNumber = getPoNumber(po);
                const supplierName = getSupplierName(po);
                const receivingLink = poId ? `/receiving?po=${poId}` : '/receiving';

                return (
                  <li key={poId || poNumber} className="po-list-item">
                    <div className="po-item-info">
                      <span className="po-item-id">
                        <a href={receivingLink}>
                          {poNumber}
                        </a>
                      </span>
                      <span className="po-item-supplier">{supplierName}</span>
                    </div>
                    <div className="po-item-details">
                      <span className="po-item-expected">
                        Expected: {formatDate(getExpectedDate(po))}
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Partial Receipt List */}
        <div className="po-list-card">
          <h3 className="po-chart-title">
            Partial Receipt
            <span className="po-count-badge po-badge-purple">{partialReceiptPOs.count}</span>
          </h3>
          <ul className="po-action-list">
            {partialReceiptPOs.list.length === 0 ? (
              <p className="po-empty-message">No partial receipts</p>
            ) : (
              partialReceiptPOs.list.map(po => {
                const poId = getPoId(po);
                const poNumber = getPoNumber(po);
                const supplierName = getSupplierName(po);
                const receivingLink = poId ? `/receiving?po=${poId}` : '/receiving';

                return (
                  <li key={poId || poNumber} className="po-list-item">
                    <div className="po-item-info">
                      <span className="po-item-id">
                        <a href={receivingLink}>
                          {poNumber}
                        </a>
                      </span>
                      <span className="po-item-supplier">{supplierName}</span>
                    </div>
                    <div className="po-item-details">
                      <span className="po-item-progress">{getPartialProgress(po)}</span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

      </div>
    </div>
  );
}

export default POsDashboard;
