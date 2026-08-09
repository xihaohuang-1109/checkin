import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { FieldConfig } from '@shared/types';

type FieldType = 'text' | 'select' | 'tel' | 'email';

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '文本',
  select: '单选',
  tel: '电话',
  email: '邮箱',
};

const VALIDITY_OPTIONS = [
  { value: 1, label: '1 天' },
  { value: 7, label: '7 天 (一周)' },
  { value: 30, label: '30 天 (一月)' },
];

export function AdminFormEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [admin, setAdmin] = useState<any>(null);

  // Form fields
  const [primaryTitle, setPrimaryTitle] = useState('');
  const [secondaryTitle, setSecondaryTitle] = useState('');
  const [fieldsConfig, setFieldsConfig] = useState<FieldConfig[]>([]);
  const [geofenceLat, setGeofenceLat] = useState<number | null>(null);
  const [geofenceLng, setGeofenceLng] = useState<number | null>(null);
  const [geofenceRadiusM, setGeofenceRadiusM] = useState<number>(100);
  const [useGeofence, setUseGeofence] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [checkinDeadline, setCheckinDeadline] = useState('');
  const [useDeadline, setUseDeadline] = useState(false);

  // QR generation
  const [qrResult, setQrResult] = useState<any>(null);
  const [qrValidity, setQrValidity] = useState(1);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // Bitable per-instance config
  const [bitableAppToken, setBitableAppToken] = useState('');
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [availableViews, setAvailableViews] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingViews, setLoadingViews] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedViewId, setSelectedViewId] = useState('');
  const [bitableStatus, setBitableStatus] = useState<any>(null);
  const [showTableDropdown, setShowTableDropdown] = useState(false);
  const [showViewDropdown, setShowViewDropdown] = useState(false);

  // Check auth
  useEffect(() => {
    api.getMe()
      .then((data) => {
        setAdmin(data.admin);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  // Fetch Bitable status (for the App Token)
  useEffect(() => {
    if (!admin) return;
    api.getBitableStatus()
      .then((data) => {
        setBitableStatus(data);
        if (data.appToken) {
          setBitableAppToken(data.appToken);
        }
      })
      .catch(() => {});
  }, [admin]);

  // Load existing instance
  useEffect(() => {
    if (!id || !admin) return;
    const load = async () => {
      try {
        const data = await api.getFormInstance(id);
        const inst = data.instance;
        setPrimaryTitle(inst.primaryTitle);
        setSecondaryTitle(inst.secondaryTitle);
        setFieldsConfig(inst.fieldsConfig || []);
        if (inst.geofenceLat != null) {
          setGeofenceLat(inst.geofenceLat);
          setGeofenceLng(inst.geofenceLng);
          setGeofenceRadiusM(inst.geofenceRadiusM || 100);
          setUseGeofence(true);
        }
        if (inst.checkinDeadline) {
          setCheckinDeadline(inst.checkinDeadline.slice(0, 16));
          setUseDeadline(true);
        }
        if (inst.qrToken) {
          setQrResult({
            qrToken: inst.qrToken,
            qrExpiresAt: inst.qrExpiresAt,
            qrUrl: `${window.location.origin}/f/${inst.id}?t=${inst.qrToken}`,
          });
        }
        // Pre-fill Bitable config
        if (inst.bitableAppToken) {
          setBitableAppToken(inst.bitableAppToken);
        }
        if (inst.bitableRecordsTableId) {
          setSelectedTableId(inst.bitableRecordsTableId);
        }
        if (inst.bitableViewId) {
          setSelectedViewId(inst.bitableViewId);
        }
      } catch (err) {
        console.error('Failed to load instance:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, admin]);

  // Redirect if not authenticated
  useEffect(() => {
    if (authChecked && !admin) {
      navigate('/admin/login');
    }
  }, [authChecked, admin, navigate]);

  // ============ Field Management ============

  const addField = () => {
    const newField: FieldConfig = {
      key: `field_${Date.now()}`,
      label: '',
      type: 'text',
      required: true,
      options: [],
      order: fieldsConfig.length,
    };
    setFieldsConfig([...fieldsConfig, newField]);
  };

  const removeField = (index: number) => {
    setFieldsConfig(fieldsConfig.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<FieldConfig>) => {
    setFieldsConfig(
      fieldsConfig.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fieldsConfig];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newFields.length) return;
    [newFields[index], newFields[target]] = [newFields[target], newFields[index]];
    // Re-assign order
    setFieldsConfig(newFields.map((f, i) => ({ ...f, order: i })));
  };

  // ============ Geofence ============

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('您的浏览器不支持定位功能');
      return;
    }

    setGettingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeofenceLat(position.coords.latitude);
        setGeofenceLng(position.coords.longitude);
        setUseGeofence(true);
        setGettingLocation(false);
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? '定位权限被拒绝，请在浏览器设置中允许定位'
            : '获取位置失败，请重试'
        );
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // ============ Save ============

  const handleSave = async () => {
    if (!primaryTitle.trim()) {
      alert('请输入一级标题');
      return;
    }
    if (!secondaryTitle.trim()) {
      alert('请输入二级标题');
      return;
    }

    setSaving(true);
    try {
      const body = {
        primaryTitle: primaryTitle.trim(),
        secondaryTitle: secondaryTitle.trim(),
        fieldsConfig: fieldsConfig
          .filter((f) => f.label.trim())
          .map((f, i) => ({ ...f, order: i })),
        geofenceLat: useGeofence ? geofenceLat : null,
        geofenceLng: useGeofence ? geofenceLng : null,
        geofenceRadiusM: useGeofence ? geofenceRadiusM : null,
        checkinDeadline: useDeadline && checkinDeadline ? new Date(checkinDeadline).toISOString() : null,
        bitableAppToken: bitableAppToken.trim() || null,
      };

      if (isEditing) {
        await api.updateFormInstance(id!, body);
      } else {
        const result = await api.createFormInstance(body);
        navigate(`/admin/form-instances/${result.instance.id}/edit`, { replace: true });
      }

      alert('保存成功');
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ============ Bitable Table/View Browsing ============

  const handleListTables = async () => {
    if (!bitableAppToken.trim()) {
      alert('请先设置多维表格 App Token');
      return;
    }
    setLoadingTables(true);
    try {
      const data = await api.listBitableTables(bitableAppToken.trim());
      setAvailableTables(data.tables);
    } catch (err: any) {
      alert(`获取表格列表失败: ${err.message}`);
    } finally {
      setLoadingTables(false);
    }
  };

  const handleListViews = async (tableId: string) => {
    if (!tableId || !bitableAppToken.trim()) return;
    setLoadingViews(true);
    try {
      const data = await api.listBitableViews(bitableAppToken.trim(), tableId);
      setAvailableViews(data.views);
    } catch (err: any) {
      alert(`获取视图列表失败: ${err.message}`);
    } finally {
      setLoadingViews(false);
    }
  };

  const handleSelectTable = (t: any) => {
    setSelectedTableId(t.tableId);
    setPrimaryTitle(t.name);
    handleListViews(t.tableId);
  };

  const handleSelectView = (v: any) => {
    setSelectedViewId(v.viewId);
    setSecondaryTitle(v.name);
  };

  // ============ QR Generation ============

  const handleGenerateQr = async () => {
    if (!id) {
      alert('请先保存填报单再生成二维码');
      return;
    }

    setGeneratingQr(true);
    setQrError(null);
    try {
      const result = await api.generateQr(id, qrValidity);
      setQrResult(result);
    } catch (err: any) {
      setQrError(err.message || '二维码生成失败');
    } finally {
      setGeneratingQr(false);
    }
  };

  if (loading) {
    return (
      <div className="container-wide" style={{ paddingTop: 60 }}>
        <div className="loading"><div className="spinner" /><p>加载中...</p></div>
      </div>
    );
  }

  return (
    <div className="container-wide" style={{ paddingTop: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div className="flex-between mb-16">
        <div>
          <button
            className="btn btn-outline text-sm"
            style={{ marginBottom: 8 }}
            onClick={() => navigate('/admin')}
          >
            ← 返回
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>
            {isEditing ? '编辑填报单' : '新建填报单'}
          </h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* Naming + Bitable Table/View */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>填报单命名 & 多维表格关联</h2>
        <p className="text-sm text-secondary" style={{ marginBottom: 16 }}>
          一级标题即多维表格中的<strong>表格名称</strong>，二级标题即该表格中的<strong>视图名称</strong>。保存时会自动查找或创建对应的表格和视图。
        </p>

        {/* App Token */}
        <div className="form-group">
          <label className="form-label">多维表格 App Token</label>
          <input
            className="form-input"
            placeholder="从飞书多维表格 URL 中提取 (base/ 后面的部分)"
            value={bitableAppToken}
            onChange={(e) => setBitableAppToken(e.target.value)}
          />
          {bitableStatus?.appToken && !bitableAppToken && (
            <p className="form-hint">
              系统已配置 App Token: {bitableStatus.appToken}，可留空使用默认值
            </p>
          )}
        </div>

        {/* 一级标题 = Table */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label">一级标题 / 表格名称 <span className="required">*</span></label>
          <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
            <input
              className="form-input"
              style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              placeholder="例如：2024 伙伴赋能培训"
              value={primaryTitle}
              onChange={(e) => setPrimaryTitle(e.target.value)}
              onFocus={() => {
                if (bitableAppToken.trim()) {
                  handleListTables();
                  setShowTableDropdown(true);
                }
              }}
            />
            <button
              className="btn btn-outline"
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: 'none',
                padding: '0 10px',
              }}
              title="浏览已有表格"
              onClick={() => {
                if (!bitableAppToken.trim()) {
                  alert('请先输入多维表格 App Token');
                  return;
                }
                handleListTables();
                setShowTableDropdown(!showTableDropdown);
              }}
              disabled={loadingTables}
            >
              {loadingTables ? '⏳' : '▾'}
            </button>
          </div>
          <p className="form-hint">作为多维表格中的表格名称，不同一级标题的签到记录归入不同的表格</p>

          {showTableDropdown && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setShowTableDropdown(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  maxHeight: 220,
                  overflowY: 'auto',
                  marginTop: 2,
                }}
              >
                <div
                  className="text-sm"
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setPrimaryTitle('');
                    setSelectedTableId('');
                    setShowTableDropdown(false);
                  }}
                >
                  ✨ 新建表格（请在下方输入名称）
                </div>
                {availableTables.map((t: any) => (
                  <div
                    key={t.tableId}
                    className="text-sm"
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      background: selectedTableId === t.tableId ? 'var(--color-primary-light)' : 'transparent',
                    }}
                    onClick={() => {
                      handleSelectTable(t);
                      setShowTableDropdown(false);
                    }}
                  >
                    <strong>{t.name}</strong>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginLeft: 8 }}>
                      {t.tableId}
                    </span>
                  </div>
                ))}
                {availableTables.length === 0 && (
                  <div className="text-sm" style={{ padding: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                    暂无已有表格
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />

        {/* 二级标题 = View */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label">二级标题 / 视图名称 <span className="required">*</span></label>
          <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
            <input
              className="form-input"
              style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              placeholder="例如：8月上海场"
              value={secondaryTitle}
              onChange={(e) => setSecondaryTitle(e.target.value)}
              onFocus={() => {
                if (selectedTableId && bitableAppToken.trim()) {
                  handleListViews(selectedTableId);
                  setShowViewDropdown(true);
                }
              }}
            />
            <button
              className="btn btn-outline"
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: 'none',
                padding: '0 10px',
              }}
              title="浏览已有视图"
              onClick={() => {
                if (!selectedTableId) {
                  alert('请先选择或输入一级标题（表格名称）');
                  return;
                }
                handleListViews(selectedTableId);
                setShowViewDropdown(!showViewDropdown);
              }}
              disabled={loadingViews}
            >
              {loadingViews ? '⏳' : '▾'}
            </button>
          </div>
          <p className="form-hint">作为表格中的视图名称，同一表格下按二级标题分组</p>

          {showViewDropdown && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setShowViewDropdown(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  maxHeight: 220,
                  overflowY: 'auto',
                  marginTop: 2,
                }}
              >
                <div
                  className="text-sm"
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setSecondaryTitle('');
                    setSelectedViewId('');
                    setShowViewDropdown(false);
                  }}
                >
                  ✨ 新建视图（请在下方输入名称）
                </div>
                {availableViews.map((v: any) => (
                  <div
                    key={v.viewId}
                    className="text-sm"
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      background: selectedViewId === v.viewId ? 'var(--color-primary-light)' : 'transparent',
                    }}
                    onClick={() => {
                      handleSelectView(v);
                      setShowViewDropdown(false);
                    }}
                  >
                    <strong>{v.name}</strong>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginLeft: 8 }}>
                      ({v.type})
                    </span>
                  </div>
                ))}
                {availableViews.length === 0 && (
                  <div className="text-sm" style={{ padding: '12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                    暂无已有视图
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16 }}>填报字段</h2>
          <button className="btn btn-outline" onClick={addField}>
            + 添加字段
          </button>
        </div>

        {fieldsConfig.length === 0 && (
          <p className="text-secondary text-sm" style={{ padding: '12px 0' }}>
            暂无字段，点击"添加字段"按钮添加（如姓名、公司等）
          </p>
        )}

        {fieldsConfig.map((field, index) => (
          <div
            key={field.key}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: 14,
              marginBottom: 10,
            }}
          >
            <div className="flex-row" style={{ gap: 8, marginBottom: 10 }}>
              <input
                className="form-input"
                style={{ flex: 2 }}
                placeholder="字段名称（如：姓名）"
                value={field.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
              />
              <select
                className="form-select"
                style={{ flex: 1 }}
                value={field.type}
                onChange={(e) => updateField(index, { type: e.target.value as FieldType })}
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                />
                必填
              </label>
            </div>

            {field.type === 'select' && (
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label text-xs">选项（用逗号分隔）</label>
                <input
                  className="form-input"
                  placeholder="选项1, 选项2, 选项3"
                  value={field.options?.join(', ') || ''}
                  onChange={(e) =>
                    updateField(index, {
                      options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
            )}

            <div className="flex-row" style={{ gap: 6 }}>
              <button
                className="btn btn-outline text-xs"
                style={{ padding: '2px 8px' }}
                onClick={() => moveField(index, 'up')}
                disabled={index === 0}
              >
                ↑ 上移
              </button>
              <button
                className="btn btn-outline text-xs"
                style={{ padding: '2px 8px' }}
                onClick={() => moveField(index, 'down')}
                disabled={index === fieldsConfig.length - 1}
              >
                ↓ 下移
              </button>
              <button
                className="btn btn-outline text-xs"
                style={{ padding: '2px 8px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                onClick={() => removeField(index)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Geofence */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16 }}>签到定位范围</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useGeofence}
              onChange={(e) => setUseGeofence(e.target.checked)}
            />
            启用定位围栏
          </label>
        </div>

        {!useGeofence && (
          <p className="text-secondary text-sm">
            未启用定位围栏，签到者可在任意位置提交
          </p>
        )}

        {useGeofence && (
          <>
            <div className="form-group">
              <label className="form-label">签到点坐标</label>
              <div className="flex-row" style={{ gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="纬度 (lat)"
                  type="number"
                  step="0.000001"
                  value={geofenceLat ?? ''}
                  onChange={(e) => setGeofenceLat(e.target.value ? parseFloat(e.target.value) : null)}
                  style={{ flex: 1 }}
                />
                <input
                  className="form-input"
                  placeholder="经度 (lng)"
                  type="number"
                  step="0.000001"
                  value={geofenceLng ?? ''}
                  onChange={(e) => setGeofenceLng(e.target.value ? parseFloat(e.target.value) : null)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="form-group">
              <button
                className="btn btn-outline"
                onClick={handleGetCurrentLocation}
                disabled={gettingLocation}
              >
                {gettingLocation ? '获取中...' : '📍 使用我当前的位置'}
              </button>
              {locationError && (
                <p className="form-hint" style={{ color: 'var(--color-danger)' }}>{locationError}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">允许范围 (米)</label>
              <input
                className="form-input"
                type="number"
                min={10}
                max={10000}
                value={geofenceRadiusM}
                onChange={(e) => setGeofenceRadiusM(parseInt(e.target.value) || 100)}
                style={{ width: 200 }}
              />
              <p className="form-hint">
                建议 100-200m。室内定位精度通常 50-150m，建议设置较宽松的范围
              </p>
            </div>
          </>
        )}
      </div>

      {/* Check-in Deadline */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16 }}>签到截止时间</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useDeadline}
              onChange={(e) => setUseDeadline(e.target.checked)}
            />
            启用截止时间
          </label>
        </div>

        {!useDeadline && (
          <p className="text-secondary text-sm">
            未启用截止时间，所有签到均标记为"正常"
          </p>
        )}

        {useDeadline && (
          <div className="form-group">
            <label className="form-label">截止时间</label>
            <input
              className="form-input"
              type="datetime-local"
              value={checkinDeadline}
              onChange={(e) => setCheckinDeadline(e.target.value)}
              style={{ width: 280 }}
            />
            <p className="form-hint">
              截止时间前提交标记为"正常"，之后提交标记为"迟到"
            </p>
          </div>
        )}
      </div>

      {/* QR Code Generation */}
      {isEditing && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>二维码管理</h2>

          <div className="form-group">
            <label className="form-label">二维码有效期</label>
            <div className="flex-row" style={{ gap: 10 }}>
              {VALIDITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="validity"
                    value={opt.value}
                    checked={qrValidity === opt.value}
                    onChange={() => setQrValidity(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerateQr}
            disabled={generatingQr}
          >
            {generatingQr ? '生成中...' : '🔑 一键生成全新二维码'}
          </button>

          {qrError && (
            <div className="alert alert-error" style={{ marginTop: 12 }}>
              {qrError}
            </div>
          )}

          {qrResult && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  padding: 16,
                  display: 'inline-block',
                  background: '#fff',
                }}
              >
                <img
                  src={api.getQrPngUrl(id!)}
                  alt="签到二维码"
                  style={{ width: 256, height: 256, display: 'block' }}
                  onError={(e) => {
                    // Fallback: if PNG endpoint fails, generate from URL
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrResult.qrUrl)}`;
                    (e.target as HTMLImageElement).src = qrUrl;
                  }}
                />
              </div>
              <p style={{ marginTop: 12, fontWeight: 500, fontSize: 15 }}>
                {primaryTitle}
              </p>
              {secondaryTitle && (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                  {secondaryTitle}
                </p>
              )}
              <p className="text-xs text-secondary" style={{ marginTop: 8 }}>
                有效期至: {new Date(qrResult.qrExpiresAt).toLocaleString('zh-CN')}
              </p>
              <p className="text-xs text-secondary" style={{ marginTop: 4, wordBreak: 'break-all' }}>
                链接: {qrResult.qrUrl}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}