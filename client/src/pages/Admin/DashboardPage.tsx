import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

interface FormInstance {
  id: string;
  primaryTitle: string;
  secondaryTitle: string;
  qrStatus: string | null;
  qrExpiresAt: string | null;
  checkinDeadline: string | null;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface BitableStatus {
  bootstrapped: boolean;
  appToken: string | null;
  recordsTableId: string | null;
  qrcodesTableId: string | null;
  recordsViewId: string | null;
  qrcodesViewId: string | null;
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [instances, setInstances] = useState<FormInstance[]>([]);
  const [bitableStatus, setBitableStatus] = useState<BitableStatus | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [activeTab, setActiveTab] = useState<'instances' | 'submissions' | 'duplicates' | 'admins'>('instances');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [manualAppToken, setManualAppToken] = useState('');
  const [manualRecordsTableId, setManualRecordsTableId] = useState('');
  const [manualQrcodesTableId, setManualQrcodesTableId] = useState('');
  const [manualRecordsViewId, setManualRecordsViewId] = useState('');
  const [manualQrcodesViewId, setManualQrcodesViewId] = useState('');
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [availableViews, setAvailableViews] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingViews, setLoadingViews] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [allowedTenantKey, setAllowedTenantKey] = useState<string | null>(null);
  const [resettingTenant, setResettingTenant] = useState(false);
  const [showConfigEdit, setShowConfigEdit] = useState(false);

  // Check auth
  useEffect(() => {
    api.getMe()
      .then((data) => {
        setAdmin(data.admin);
        setAuthChecked(true);
      })
      .catch(() => {
        setAuthChecked(true);
      });
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    if (!admin) return;
    try {
      const [instData, bitableData] = await Promise.all([
        api.listFormInstances(),
        api.getBitableStatus(),
      ]);
      setInstances(instData.instances);
      setBitableStatus(bitableData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [admin]);

  useEffect(() => {
    if (admin) loadData();
  }, [admin, loadData]);

  // Load submissions
  const loadSubmissions = useCallback(async () => {
    try {
      const data = await api.listSubmissions();
      setSubmissions(data.submissions);
      setDuplicates(data.submissions.filter((s: any) => s.possibleDuplicate));
    } catch (err) {
      console.error('Failed to load submissions:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'submissions' || activeTab === 'duplicates') {
      loadSubmissions();
    }
  }, [activeTab, loadSubmissions]);

  // Load admins
  const loadAdmins = useCallback(async () => {
    try {
      const data = await api.listAdmins();
      setAdmins(data.admins);
    } catch (err) {
      console.error('Failed to load admins:', err);
    }
  }, []);
  useEffect(() => {
    if (activeTab === 'admins' && admin?.isSuperAdmin) {
      loadAdmins();
      loadTenant();
    }
  }, [activeTab, admin, loadAdmins]);

  const loadTenant = useCallback(async () => {
    try {
      const data = await api.getAllowedTenant();
      setAllowedTenantKey(data.allowedTenantKey);
    } catch (err) {
      console.error('Failed to load tenant:', err);
    }
  }, []);

  const handleResetTenant = async () => {
    if (!confirm('确定要重置企业限制吗？这将清空所有管理员，下次登录的用户将成为新的超级管理员。')) return;
    setResettingTenant(true);
    try {
      await api.resetTenant();
      alert('企业限制已重置，所有管理员已清空。');
      setAdmins([]);
      setAllowedTenantKey(null);
    } catch (err: any) {
      alert(`重置失败: ${err.message}`);
    } finally {
      setResettingTenant(false);
    }
  };

  const handleToggleAdmin = async (id: string) => {
    if (!confirm('确定要切换该管理员的状态吗？')) return;
    try {
      await api.toggleAdminActive(id);
      await loadAdmins();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Bootstrap Bitable
  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const result = await api.bootstrapBitable();
      alert(`Bitable 初始化成功！\nApp Token: ${result.appToken}`);
      await loadData();
    } catch (err: any) {
      alert(`初始化失败: ${err.message}`);
    } finally {
      setBootstrapping(false);
    }
  };

  // Delete instance
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个填报单吗？相关提交记录也会被删除。')) return;
    try {
      await api.deleteFormInstance(id);
      await loadData();
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  // Toggle duplicate flag
  const handleToggleDuplicate = async (id: string) => {
    try {
      await api.toggleDuplicate(id);
      await loadSubmissions();
    } catch (err: any) {
      alert(`操作失败: ${err.message}`);
    }
  };

  // Retry sync
  const handleRetrySync = async () => {
    setSyncing(true);
    try {
      const result = await api.retrySync();
      alert(`同步完成: ${result.succeeded}/${result.total} 条记录已同步`);
      await loadSubmissions();
    } catch (err: any) {
      alert(`同步失败: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Manual Bitable config
  const handleManualConfig = async () => {
    if (!manualAppToken.trim() || !manualRecordsTableId.trim()) {
      alert('请填写 App Token 和记录表 ID');
      return;
    }
    try {
      await api.setBitableConfig(
        manualAppToken.trim(),
        manualRecordsTableId.trim(),
        manualQrcodesTableId.trim() || undefined,
        manualRecordsViewId.trim() || undefined,
        manualQrcodesViewId.trim() || undefined
      );
      alert('多维表格配置成功！');
      setShowManualConfig(false);
      setShowConfigEdit(false);
      await loadData();
    } catch (err: any) {
      alert(`配置失败: ${err.message}`);
    }
  };

  const handleListTables = async () => {
    setLoadingTables(true);
    try {
      const data = await api.listBitableTables(manualAppToken.trim());
      setAvailableTables(data.tables);
    } catch (err: any) {
      alert(`获取表格列表失败: ${err.message}`);
    } finally {
      setLoadingTables(false);
    }
  };

  const handleListViews = async (tableId: string) => {
    if (!tableId) return;
    setLoadingViews(true);
    try {
      const data = await api.listBitableViews(manualAppToken.trim(), tableId);
      setAvailableViews(data.views);
    } catch (err: any) {
      alert(`获取视图列表失败: ${err.message}`);
    } finally {
      setLoadingViews(false);
    }
  };

  // Open config editor with existing values pre-filled
  const handleEditConfig = () => {
    if (!showConfigEdit) {
      // Opening — pre-fill with current values
      if (bitableStatus) {
        setManualAppToken(bitableStatus.appToken || '');
        setManualRecordsTableId(bitableStatus.recordsTableId || '');
        setManualQrcodesTableId(bitableStatus.qrcodesTableId || '');
        setManualRecordsViewId(bitableStatus.recordsViewId || '');
        setManualQrcodesViewId(bitableStatus.qrcodesViewId || '');
      }
      setShowConfigEdit(true);
      setShowManualConfig(true);
    } else {
      // Closing
      setShowConfigEdit(false);
      setShowManualConfig(false);
      setAvailableTables([]);
      setAvailableViews([]);
    }
  };

  // Logout
  const handleLogout = async () => {
    await api.logout();
    window.location.reload();
  };

  // Not authenticated
  if (authChecked && !admin) {
    navigate('/admin/login');
    return null;
  }

  if (loading) {
    return (
      <div className="container-wide" style={{ paddingTop: 60 }}>
        <div className="loading">
          <div className="spinner" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-wide" style={{ paddingTop: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>签到管理后台</h1>
          <p className="text-secondary text-sm">伙伴赋能培训签到</p>
        </div>
        <div className="flex-row">
          {admin && (
            <span className="text-sm text-secondary" style={{ marginRight: 12 }}>
              {admin.name}
            </span>
          )}
          <button className="btn btn-outline" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </div>

      {/* Bitable status */}
      {!bitableStatus?.bootstrapped && (
        <div className="alert alert-info">
          <div className="flex-between">
            <span>⚠️ 飞书多维表格尚未初始化</span>
            <div className="flex-row" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleBootstrap}
                disabled={bootstrapping}
              >
                {bootstrapping ? '初始化中...' : '自动创建多维表格'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setShowManualConfig(!showManualConfig)}
              >
                {showManualConfig ? '取消' : '手动配置已有表格'}
              </button>
            </div>
          </div>
          {showManualConfig && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--color-bg)', borderRadius: 8 }}>
              <p className="text-sm text-secondary" style={{ marginBottom: 8 }}>
                从飞书多维表格 URL 中提取参数。URL 格式如：
                <br />
                <code>https://xxx.feishu.cn/base/APP_TOKEN?table=TABLE_ID&view=VIEW_ID</code>
              </p>
              <div className="form-group">
                <label className="text-sm">App Token (base/ 后面那段)</label>
                <input className="input" value={manualAppToken} onChange={(e) => setManualAppToken(e.target.value)} placeholder="DYnxb3HPoaD8nsso53JcNFUFnzb" />
              </div>
              <div className="flex-row" style={{ gap: 8, marginBottom: 12 }}>
                <button className="btn btn-outline text-sm" onClick={handleListTables} disabled={loadingTables || !manualAppToken.trim()}>
                  {loadingTables ? '加载中...' : '📋 查询已有表格'}
                </button>
              </div>
              {availableTables.length > 0 && (
                <div style={{ marginBottom: 12, padding: 8, background: 'var(--color-bg)', borderRadius: 6 }}>
                  <p className="text-sm" style={{ marginBottom: 6 }}>数据库中的表格：</p>
                  {availableTables.map((t: any) => (
                    <div key={t.tableId} className="text-sm" style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-light)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => { setManualRecordsTableId(t.tableId); handleListViews(t.tableId); }}>
                      <strong>{t.name}</strong> — <code>{t.tableId}</code>
                    </div>
                  ))}
                </div>
              )}
              <div className="form-group">
                <label className="text-sm">签到记录表 ID <span className="required">*</span></label>
                <input className="input" value={manualRecordsTableId} onChange={(e) => setManualRecordsTableId(e.target.value)} placeholder="tblZGp1EbjYWaxBV" />
              </div>
              <div className="flex-row" style={{ gap: 8, marginBottom: 12 }}>
                <button className="btn btn-outline text-sm" onClick={() => handleListViews(manualRecordsTableId)} disabled={loadingViews || !manualRecordsTableId.trim()}>
                  {loadingViews ? '加载中...' : '📋 查询该表视图'}
                </button>
              </div>
              {availableViews.length > 0 && (
                <div style={{ marginBottom: 12, padding: 8, background: 'var(--color-bg)', borderRadius: 6 }}>
                  <p className="text-sm" style={{ marginBottom: 6 }}>该表中的视图：</p>
                  {availableViews.map((v: any) => (
                    <div key={v.viewId} className="text-sm" style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-light)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setManualRecordsViewId(v.viewId)}>
                      <strong>{v.name}</strong> ({v.type}) — <code>{v.viewId}</code>
                    </div>
                  ))}
                </div>
              )}
              <div className="form-group">
                <label className="text-sm">签到记录视图 ID (可选)</label>
                <input className="input" value={manualRecordsViewId} onChange={(e) => setManualRecordsViewId(e.target.value)} placeholder="vewI06oXJ3" />
              </div>
              <div className="form-group">
                <label className="text-sm">签到码表 ID (可选)</label>
                <input className="input" value={manualQrcodesTableId} onChange={(e) => setManualQrcodesTableId(e.target.value)} placeholder="可选" />
              </div>
              <div className="form-group">
                <label className="text-sm">签到码视图 ID (可选)</label>
                <input className="input" value={manualQrcodesViewId} onChange={(e) => setManualQrcodesViewId(e.target.value)} placeholder="可选" />
              </div>
              <button className="btn btn-primary" onClick={handleManualConfig}>保存配置</button>
            </div>
          )}
        </div>
      )}

      {bitableStatus?.bootstrapped && (
        <div className="alert alert-success text-sm">
          <div className="flex-between">
            <div>
              ✅ 多维表格已连接 · App Token: <code>{bitableStatus.appToken}</code>
              <br />
              <span className="text-xs">记录表: {bitableStatus.recordsTableId || '-'}</span>
              {bitableStatus.recordsViewId && <span className="text-xs"> · 视图: {bitableStatus.recordsViewId}</span>}
              <br />
              {bitableStatus.qrcodesTableId && <span className="text-xs">签到码表: {bitableStatus.qrcodesTableId}</span>}
              {bitableStatus.qrcodesViewId && <span className="text-xs"> · 视图: {bitableStatus.qrcodesViewId}</span>}
            </div>
            <button className="btn btn-outline text-sm" onClick={handleEditConfig}>
              {showConfigEdit ? '取消' : '✏️ 修改配置'}
            </button>
          </div>
          {showConfigEdit && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--color-bg)', borderRadius: 8 }}>
              <p className="text-sm text-secondary" style={{ marginBottom: 8 }}>修改多维表格连接配置</p>
              <div className="form-group">
                <label className="text-sm">App Token</label>
                <input className="input" value={manualAppToken} onChange={(e) => setManualAppToken(e.target.value)} />
              </div>
              <div className="flex-row" style={{ gap: 8, marginBottom: 12 }}>
                <button className="btn btn-outline text-sm" onClick={handleListTables} disabled={loadingTables || !manualAppToken.trim()}>
                  {loadingTables ? '加载中...' : '📋 查询已有表格'}
                </button>
              </div>
              {availableTables.length > 0 && (
                <div style={{ marginBottom: 12, padding: 8, background: 'var(--color-bg)', borderRadius: 6 }}>
                  <p className="text-sm" style={{ marginBottom: 6 }}>数据库中的表格：</p>
                  {availableTables.map((t: any) => (
                    <div key={t.tableId} className="text-sm" style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-light)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => { setManualRecordsTableId(t.tableId); handleListViews(t.tableId); }}>
                      <strong>{t.name}</strong> — <code>{t.tableId}</code>
                    </div>
                  ))}
                </div>
              )}
              <div className="form-group">
                <label className="text-sm">签到记录表 ID</label>
                <input className="input" value={manualRecordsTableId} onChange={(e) => setManualRecordsTableId(e.target.value)} />
              </div>
              <div className="flex-row" style={{ gap: 8, marginBottom: 12 }}>
                <button className="btn btn-outline text-sm" onClick={() => handleListViews(manualRecordsTableId)} disabled={loadingViews || !manualRecordsTableId.trim()}>
                  {loadingViews ? '加载中...' : '📋 查询该表视图'}
                </button>
              </div>
              {availableViews.length > 0 && (
                <div style={{ marginBottom: 12, padding: 8, background: 'var(--color-bg)', borderRadius: 6 }}>
                  <p className="text-sm" style={{ marginBottom: 6 }}>该表中的视图：</p>
                  {availableViews.map((v: any) => (
                    <div key={v.viewId} className="text-sm" style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-light)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setManualRecordsViewId(v.viewId)}>
                      <strong>{v.name}</strong> ({v.type}) — <code>{v.viewId}</code>
                    </div>
                  ))}
                </div>
              )}
              <div className="form-group">
                <label className="text-sm">签到记录视图 ID</label>
                <input className="input" value={manualRecordsViewId} onChange={(e) => setManualRecordsViewId(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="text-sm">签到码表 ID</label>
                <input className="input" value={manualQrcodesTableId} onChange={(e) => setManualQrcodesTableId(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="text-sm">签到码视图 ID</label>
                <input className="input" value={manualQrcodesViewId} onChange={(e) => setManualQrcodesViewId(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={handleManualConfig}>保存修改</button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'instances' ? 'active' : ''}`}
          onClick={() => setActiveTab('instances')}
        >
          填报单管理
        </button>
        <button
          className={`tab ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissions')}
        >
          提交记录
        </button>
        <button
          className={`tab ${activeTab === 'duplicates' ? 'active' : ''}`}
          onClick={() => setActiveTab('duplicates')}
        >
          疑似重复
          {duplicates.length > 0 && (
            <span className="badge badge-warning" style={{ marginLeft: 6 }}>
              {duplicates.length}
            </span>
          )}
        </button>
        {admin?.isSuperAdmin && (
          <button
            className={`tab ${activeTab === 'admins' ? 'active' : ''}`}
            onClick={() => setActiveTab('admins')}
          >
            管理员
          </button>
        )}
      </div>

      {/* ==================== Instances Tab ==================== */}
      {activeTab === 'instances' && (
        <>
          <div className="flex-between mb-16">
            <h2 style={{ fontSize: 16 }}>填报单列表</h2>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/admin/form-instances/new')}
            >
              + 新建填报单
            </button>
          </div>

          {instances.length === 0 ? (
            <div className="card text-center" style={{ padding: 40 }}>
              <p className="text-secondary">暂无填报单，点击上方按钮创建</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>一级标题</th>
                    <th>二级标题</th>
                    <th>提交数</th>
                    <th>二维码</th>
                    <th>截止时间</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((inst) => (
                    <tr key={inst.id}>
                      <td style={{ fontWeight: 500 }}>{inst.primaryTitle}</td>
                      <td>{inst.secondaryTitle}</td>
                      <td>{inst.submissionCount}</td>
                      <td>
                        {inst.qrStatus === 'active' ? (
                          <span className="badge badge-success">有效</span>
                        ) : inst.qrStatus === 'expired' ? (
                          <span className="badge badge-danger">已过期</span>
                        ) : (
                          <span className="badge badge-info">未生成</span>
                        )}
                      </td>
                      <td className="text-sm text-secondary">
                        {inst.checkinDeadline
                          ? new Date(inst.checkinDeadline).toLocaleString('zh-CN')
                          : '-'}
                      </td>
                      <td className="text-sm text-secondary">
                        {new Date(inst.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td>
                        <div className="flex-row" style={{ gap: 6 }}>
                          <button
                            className="btn btn-outline text-sm"
                            style={{ padding: '4px 10px' }}
                            onClick={() => navigate(`/admin/form-instances/${inst.id}/edit`)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn btn-outline text-sm"
                            style={{ padding: '4px 10px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                            onClick={() => handleDelete(inst.id)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==================== Submissions Tab ==================== */}
      {activeTab === 'submissions' && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>提交记录</h2>
          <div className="flex-between mb-16">
            <span className="text-sm text-secondary">共 {submissions.length} 条记录</span>
            <button
              className="btn btn-outline"
              onClick={handleRetrySync}
              disabled={syncing}
            >
              {syncing ? '同步中...' : '🔄 同步到多维表格'}
            </button>
          </div>
          {submissions.length === 0 ? (
            <div className="card text-center" style={{ padding: 40 }}>
              <p className="text-secondary">暂无提交记录</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>一级标题</th>
                    <th>二级标题</th>
                    <th>签到时间</th>
                    <th>签到状态</th>
                    <th>同步状态</th>
                    <th>疑似重复</th>
                    <th>错误信息</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr key={sub.id}>
                      <td>{sub.formInstance?.primaryTitle || '-'}</td>
                      <td>{sub.formInstance?.secondaryTitle || '-'}</td>
                      <td className="text-sm">
                        {new Date(sub.submittedAt).toLocaleString('zh-CN')}
                      </td>
                      <td>
                        {sub.checkinStatus === 'late' ? (
                          <span className="badge badge-danger">迟到</span>
                        ) : sub.checkinStatus === 'normal' ? (
                          <span className="badge badge-success">正常</span>
                        ) : (
                          <span className="badge badge-info">-</span>
                        )}
                      </td>
                      <td>
                        {sub.syncStatus === 'synced' ? (
                          <span className="badge badge-success">已同步</span>
                        ) : sub.syncStatus === 'failed' ? (
                          <span className="badge badge-danger" title={sub.syncError || ''}>失败</span>
                        ) : (
                          <span className="badge badge-warning">待同步</span>
                        )}
                      </td>
                      <td>
                        {sub.possibleDuplicate ? (
                          <span className="badge badge-warning">⚠ 疑似</span>
                        ) : (
                          <span className="badge badge-success">正常</span>
                        )}
                      </td>
                      <td className="text-sm text-secondary" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sub.syncError || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==================== Duplicates Tab ==================== */}
      {activeTab === 'duplicates' && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>疑似重复提交</h2>
          <p className="text-sm text-secondary mb-16">
            以下提交记录的 IP、设备指纹与姓名匹配度高，但来自不同设备 ID。请人工复核是否为重复提交。
          </p>
          {duplicates.length === 0 ? (
            <div className="card text-center" style={{ padding: 40 }}>
              <p className="text-secondary">暂无疑似重复记录 ✅</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>一级标题</th>
                    <th>二级标题</th>
                    <th>提交时间</th>
                    <th>提交内容</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.map((sub) => (
                    <tr key={sub.id}>
                      <td>{sub.formInstance?.primaryTitle || '-'}</td>
                      <td>{sub.formInstance?.secondaryTitle || '-'}</td>
                      <td className="text-sm">
                        {new Date(sub.submittedAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="text-sm">
                        {JSON.stringify(sub.submittedFields).substring(0, 60)}...
                      </td>
                      <td>
                        <button
                          className="btn btn-outline text-sm"
                          style={{ padding: '4px 10px' }}
                          onClick={() => handleToggleDuplicate(sub.id)}
                        >
                          标记为正常
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==================== Admins Tab ==================== */}
      {activeTab === 'admins' && admin?.isSuperAdmin && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>管理员列表</h2>
          <p className="text-sm text-secondary mb-16">
            其他飞书用户扫码登录后自动成为管理员。超级管理员可以启用/禁用其他管理员。
          </p>
          {allowedTenantKey && (
            <div className="alert alert-info text-sm" style={{ marginBottom: 16 }}>
              <div className="flex-between">
                <span>
                  🔒 企业限制已启用 · Tenant Key: <code>{allowedTenantKey}</code>
                </span>
                <button
                  className="btn btn-outline text-sm"
                  style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                  onClick={handleResetTenant}
                  disabled={resettingTenant}
                >
                  {resettingTenant ? '重置中...' : '重置企业限制'}
                </button>
              </div>
            </div>
          )}
          {admins.length === 0 ? (
            <div className="card text-center" style={{ padding: 40 }}>
              <p className="text-secondary">暂无管理员</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>飞书 Open ID</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>加入时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a: any) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>{a.name || '-'}</td>
                      <td className="text-sm text-secondary">{a.feishuOpenId}</td>
                      <td>
                        {a.isSuperAdmin ? (
                          <span className="badge badge-primary">超级管理员</span>
                        ) : (
                          <span className="badge badge-info">管理员</span>
                        )}
                      </td>
                      <td>
                        {a.isActive ? (
                          <span className="badge badge-success">启用</span>
                        ) : (
                          <span className="badge badge-danger">禁用</span>
                        )}
                      </td>
                      <td className="text-sm text-secondary">
                        {new Date(a.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td>
                        {!a.isSuperAdmin && (
                          <button
                            className="btn btn-outline text-sm"
                            style={{
                              padding: '4px 10px',
                              color: a.isActive ? 'var(--color-danger)' : 'var(--color-success)',
                              borderColor: a.isActive ? 'var(--color-danger)' : 'var(--color-success)',
                            }}
                            onClick={() => handleToggleAdmin(a.id)}
                          >
                            {a.isActive ? '禁用' : '启用'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}