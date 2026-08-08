import React from 'react';

export function AdminLoginPage() {
  return (
    <div className="container" style={{ paddingTop: 80 }}>
      <div className="card text-center">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>管理员登录</h1>
        <p className="text-secondary" style={{ marginBottom: 24 }}>
          使用飞书扫码登录管理后台
        </p>
        <a
          href="/api/auth/feishu/login"
          className="btn btn-primary btn-lg"
          style={{ display: 'inline-flex', width: 'auto', padding: '12px 32px' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z"/>
          </svg>
          飞书扫码登录
        </a>
      </div>
    </div>
  );
}