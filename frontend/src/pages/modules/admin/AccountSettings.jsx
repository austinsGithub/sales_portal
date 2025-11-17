import React, { useState } from 'react';
import { User, Lock, Bell } from 'lucide-react';
import "../../../css/modules/account/AccountSettings.css";

function AccountSettings() {
  const [activeTab, setActiveTab] = useState('profile');

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileSettings />;
      case 'password':
        return <PasswordSettings />;
      case 'notifications':
        return <NotificationSettings />;
      default:
        return <ProfileSettings />;
    }
  };

  return (
    <div className="account-settings-container">
      <h1 className="main-title">Account Settings</h1>
      <div className="account-settings-layout">
        <div className="settings-nav">
          <button onClick={() => setActiveTab('profile')} className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}>
            <User size={20} />
            <span>Profile</span>
          </button>
          <button onClick={() => setActiveTab('password')} className={`nav-item ${activeTab === 'password' ? 'active' : ''}`}>
            <Lock size={20} />
            <span>Password</span>
          </button>
          <button onClick={() => setActiveTab('notifications')} className={`nav-item ${activeTab === 'notifications' ? 'active' : ''}`}>
            <Bell size={20} />
            <span>Notifications</span>
          </button>
        </div>
        <div className="settings-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function ProfileSettings() {
  return (
    <div className="settings-card">
      <h2 className="card-title">Profile Information</h2>
      <p className="card-description">Update your personal details here.</p>
      <form className="settings-form">
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input id="fullName" type="text" defaultValue="Austin Howard" className="form-input" />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input id="email" type="email" defaultValue="austin@example.com" className="form-input" />
        </div>
        <div className="form-actions">
          <button type="submit" className="action-btn submit-btn">Save Changes</button>
        </div>
      </form>
    </div>
  );
}

function PasswordSettings() {
  return (
    <div className="settings-card">
      <h2 className="card-title">Change Password</h2>
      <p className="card-description">Choose a strong password and don't reuse it for other accounts.</p>
      <form className="settings-form">
        <div className="form-group">
          <label htmlFor="currentPassword">Current Password</label>
          <input id="currentPassword" type="password" className="form-input" />
        </div>
        <div className="form-group">
          <label htmlFor="newPassword">New Password</label>
          <input id="newPassword" type="password" className="form-input" />
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input id="confirmPassword" type="password" className="form-input" />
        </div>
        <div className="form-actions">
          <button type="submit" className="action-btn submit-btn">Update Password</button>
        </div>
      </form>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="settings-card">
      <h2 className="card-title">Notification Settings</h2>
      <p className="card-description">Manage how you receive notifications.</p>
      <form className="settings-form">
        <div className="notification-option">
          <div className="option-text">
            <strong>Order Updates</strong>
            <p>Receive notifications for status changes on your orders.</p>
          </div>
          <label className="switch">
            <input type="checkbox" defaultChecked />
            <span className="slider round"></span>
          </label>
        </div>
        <div className="notification-option">
          <div className="option-text">
            <strong>Promotions</strong>
            <p>Receive news about promotions and new products.</p>
          </div>
          <label className="switch">
            <input type="checkbox" />
            <span className="slider round"></span>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="action-btn submit-btn">Save Preferences</button>
        </div>
      </form>
    </div>
  );
}

export default AccountSettings;
