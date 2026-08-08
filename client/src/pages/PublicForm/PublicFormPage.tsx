import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useDeviceId } from './useDeviceId';
import { useGeofence } from './useGeofence';
import { FormFieldRenderer } from './FormFieldRenderer';
import { AlreadySubmittedNotice } from './AlreadySubmittedNotice';
import type { FieldConfig } from '@shared/types';

export function PublicFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') || '';
  const deviceId = useDeviceId();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [expired, setExpired] = useState(false);
  const [instance, setInstance] = useState<any>(null);
  const [fieldsConfig, setFieldsConfig] = useState<FieldConfig[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Geofence — memoize config to prevent infinite re-render loop
  const geofenceConfig = useMemo(() => {
    if (
      instance?.geofenceLat != null &&
      instance?.geofenceLng != null &&
      instance?.geofenceRadiusM != null
    ) {
      return {
        lat: instance.geofenceLat,
        lng: instance.geofenceLng,
        radiusM: instance.geofenceRadiusM,
      };
    }
    return null;
  }, [instance?.geofenceLat, instance?.geofenceLng, instance?.geofenceRadiusM]);

  const geofence = useGeofence(geofenceConfig);

  // Load form status
  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        setLoading(true);
        const data = await api.getFormStatus(id, deviceId, token);
        setInstance(data.instance);
        setFieldsConfig(data.instance.fieldsConfig || []);
        setAlreadySubmitted(data.alreadySubmitted);

        // Initialize form values
        const initial: Record<string, string> = {};
        for (const field of data.instance.fieldsConfig || []) {
          initial[field.key] = '';
        }
        setFormValues(initial);

        if (data.alreadySubmitted) {
          setAlreadySubmitted(true);
        }
      } catch (err: any) {
        if (err.message?.includes('expired')) {
          setExpired(true);
        } else {
          setError(err.message || '加载失败');
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, deviceId, token]);

  // Handle field value changes
  const handleFieldChange = useCallback((key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Check if all required fields are filled
  const allRequiredFilled = fieldsConfig
    .filter((f) => f.required)
    .every((f) => formValues[f.key]?.trim());

  const hasGeofence = geofenceConfig !== null;
  const withinGeofence = !hasGeofence || geofence.withinGeofence;
  const canSubmit =
    allRequiredFilled &&
    withinGeofence &&
    !submitting &&
    !submitted &&
    !alreadySubmitted &&
    !geofence.loading &&
    !geofence.error;

  // Submit
  const handleSubmit = async () => {
    if (!canSubmit || !id) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await api.submitForm(id, {
        deviceId,
        fields: formValues,
        clientLat: geofence.currentDistance !== null ? geofenceConfig?.lat ?? null : null,
        clientLng: geofence.currentDistance !== null ? geofenceConfig?.lng ?? null : null,
        clientAccuracy: geofence.accuracy,
      });
      setSubmitted(true);
    } catch (err: any) {
      if (err.message?.includes('Already submitted') || err.message?.includes('already submitted')) {
        setAlreadySubmitted(true);
      } else {
        setSubmitError(err.message || '提交失败，请重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="loading">
          <div className="spinner" />
          <p style={{ marginTop: 12 }}>加载中...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="card text-center">
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2>加载失败</h2>
          <p className="text-secondary" style={{ marginTop: 8 }}>{error}</p>
        </div>
      </div>
    );
  }

  // Expired
  if (expired) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="card text-center">
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
          <h2>二维码已过期</h2>
          <p className="text-secondary" style={{ marginTop: 8 }}>
            该签到二维码已超过有效期，请联系管理员生成新的二维码
          </p>
        </div>
      </div>
    );
  }

  // Already submitted
  if (alreadySubmitted || submitted) {
    return (
      <AlreadySubmittedNotice
        primaryTitle={instance?.primaryTitle || ''}
        secondaryTitle={instance?.secondaryTitle || ''}
      />
    );
  }

  // Get button state
  let buttonClass = 'btn btn-lg';
  let buttonText = '提交签到';
  let buttonDisabled = true;

  if (submitting) {
    buttonClass += ' btn-primary';
    buttonText = '提交中...';
    buttonDisabled = true;
  } else if (geofence.loading && hasGeofence) {
    buttonClass += ' btn-disabled-location';
    buttonText = '正在获取位置...';
  } else if (geofence.error && hasGeofence) {
    buttonClass += ' btn-disabled-location';
    buttonText = '定位不可用';
  } else if (!hasGeofence) {
    // No geofence configured — allow submit if fields are filled
    if (allRequiredFilled) {
      buttonClass += ' btn-primary';
      buttonDisabled = false;
    } else {
      buttonClass += ' btn-disabled-location';
      buttonText = '请填写必填项';
    }
  } else if (!withinGeofence) {
    buttonClass += ' btn-disabled-location';
    buttonText = `不在签到范围内${
      geofence.currentDistance ? ` (${geofence.currentDistance}m)` : ''
    }`;
  } else if (!allRequiredFilled) {
    buttonClass += ' btn-disabled-location';
    buttonText = '请填写必填项';
  } else {
    buttonClass += ' btn-ready';
    buttonText = '✅ 提交签到';
    buttonDisabled = false;
  }

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 40 }}>
      {/* Header */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          {instance?.primaryTitle || '培训签到'}
        </h1>
        {instance?.secondaryTitle && (
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            {instance.secondaryTitle}
          </p>
        )}
      </div>

      {/* Geofence status — only show if geofence is configured */}
      {hasGeofence && (
        <div
          className={`status-bar ${
            geofence.error ? 'error' : geofence.withinGeofence ? 'inside' : 'outside'
          }`}
        >
          {geofence.loading ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14 }} />
              <span>正在获取位置...</span>
            </>
          ) : geofence.error ? (
            <span>⚠️ {geofence.error}</span>
          ) : geofence.withinGeofence ? (
            <span>📍 已在签到范围内</span>
          ) : (
            <span>
              📍 距签到点约 {geofence.currentDistance ?? '?'}m，进入范围后可提交
              {geofence.accuracy ? ` (精度: ±${geofence.accuracy}m)` : ''}
            </span>
          )}
        </div>
      )}

      {/* Form */}
      <div className="card">
        {fieldsConfig.length === 0 ? (
          <p className="text-secondary text-center" style={{ padding: 20 }}>
            暂无填写项
          </p>
        ) : (
          fieldsConfig
            .sort((a, b) => a.order - b.order)
            .map((field) => (
              <FormFieldRenderer
                key={field.key}
                field={field}
                value={formValues[field.key] || ''}
                onChange={handleFieldChange}
                disabled={submitting}
              />
            ))
        )}

        {/* Submit error */}
        {submitError && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {submitError}
          </div>
        )}

        {/* Submit button */}
        <div style={{ marginTop: 24 }}>
          <button
            className={buttonClass}
            disabled={buttonDisabled}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                {buttonText}
              </>
            ) : (
              buttonText
            )}
          </button>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-center text-secondary" style={{ marginTop: 16 }}>
        同一设备仅可提交一次
      </p>
    </div>
  );
}