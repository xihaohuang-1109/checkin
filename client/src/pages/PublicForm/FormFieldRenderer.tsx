import React from 'react';
import type { FieldConfig } from '@shared/types';

interface Props {
  field: FieldConfig;
  value: string;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}

export function FormFieldRenderer({ field, value, onChange, disabled }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange(field.key, e.target.value);
  };

  if (field.type === 'select') {
    return (
      <div className="form-group">
        <label className="form-label">
          {field.label}
          {field.required && <span className="required">*</span>}
        </label>
        <select
          className="form-select"
          value={value}
          onChange={handleChange}
          disabled={disabled}
        >
          <option value="">请选择{field.label}</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="form-group">
      <label className="form-label">
        {field.label}
        {field.required && <span className="required">*</span>}
      </label>
      <input
        className="form-input"
        type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
        placeholder={`请输入${field.label}`}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  );
}