import React from 'react';

interface Props {
  primaryTitle: string;
  secondaryTitle: string;
}

export function AlreadySubmittedNotice({ primaryTitle, secondaryTitle }: Props) {
  return (
    <div className="container" style={{ paddingTop: 60 }}>
      <div className="card text-center">
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>您已签到成功</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          该设备已提交过此签到，无需重复提交
        </p>
        <div className="alert alert-info">
          <div style={{ fontSize: 14, fontWeight: 500 }}>{primaryTitle}</div>
          {secondaryTitle && (
            <div style={{ fontSize: 13, marginTop: 4 }}>{secondaryTitle}</div>
          )}
        </div>
        <p className="text-xs text-secondary" style={{ marginTop: 16 }}>
          如有疑问请联系现场工作人员
        </p>
      </div>
    </div>
  );
}