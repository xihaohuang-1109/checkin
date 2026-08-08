import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

interface FormInstance {
  id: string;
  primaryTitle: string;
  secondaryTitle: string;
  qrStatus: string | null;
  qrExpiresAt: string | null;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface BitableStatus {
  bootstrapped: boolean;
  appToken: string | null;
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [instances, setInstances] = useState<FormInstance[]>([]);
  const [bitableStatus, setBitableStatus] = useState<BitableStatus | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [activeTab, setActiveTab] = useState<'instances' | 'submissions' | 'duplicates'>('instances');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [manualAppToken, setManualAppToken] = useState('');
  const [manualRecordsTableId, setManualRecordsTableId] = useState('');
  const [manualQrcodesTableId, setManualQrcodesTableId] = useState('');

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
        manualQrcodesTableId.trim() || undefined
      );
      alert('多维表格配置成功！');
      setShowManualConfig(false);
      await loadData();
    } catch (err: any) {
      alert(`配置失败: ${err.message}`);
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
                <code>https://xxx.feishu.cn/base/APP_TOKEN?table=TABLE_ID</code>
              </p>
              <div className="form-group">
                <label className="text-sm">App Token (base/ 后面那段)</label>
                <input
                  className="input"
                  value={manualAppToken}
                  onChange={(e) => setManualAppToken(e.target.value)}
                  placeholder="DYnxb3HPoaD8nsso53JcNFUFnzb"
                />
              </div>
              <div className="form-group">
                <label className="text-sm">签到记录表 ID (table= 参数)</label>
                <input
                  className="input"
                  value={manualRecordsTableId}
                  onChange={(e) => setManualRecordsTableId(e.target.value)}
                  placeholder="tblZGp1EbjYWaxBV"
                />
              </div>
              <div className="form-group">
                <label className="text-sm">签到码表 ID (可选)</label>
                <input
                  className="input"
                  value={manualQrcodesTableId}
                  onChange={(e) => setManualQrcodesTableId(e.target.value)}
                  placeholder="可选"
                />
              </div>
              <button className="btn btn-primary" onClick={handleManualConfig}>
                保存配置
              </button>
            </div>
          )}
        </div>
      )}

      {bitableStatus?.bootstrapped && (
        <div className="alert alert-success text-sm">
          ✅ 多维表格已连接 · App Token: {bitableStatus.appToken}
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
                    <th>提交时间</th>
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
    </div>
  );
}