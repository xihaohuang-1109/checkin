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

  // Check auth
  useEffect(() => {
    api.getMe()
      .then((data) => {
        setAdmin(data.admin);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

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

      {/* Naming */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>填报单命名</h2>
        <div className="form-group">
          <label className="form-label">一级标题 <span className="required">*</span></label>
          <input
            className="form-input"
            placeholder="例如：2024 伙伴赋能培训"
            value={primaryTitle}
            onChange={(e) => setPrimaryTitle(e.target.value)}
          />
          <p className="form-hint">不同一级标题的签到记录会归入不同的视图</p>
        </div>
        <div className="form-group">
          <label className="form-label">二级标题 <span className="required">*</span></label>
          <input
            className="form-input"
            placeholder="例如：8月上海场"
            value={secondaryTitle}
            onChange={(e) => setSecondaryTitle(e.target.value)}
          />
          <p className="form-hint">同一一级标题下，按二级标题分组</p>
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