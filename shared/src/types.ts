export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'select' | 'tel' | 'email';
  required: boolean;
  options?: string[]; // for select type
  order: number;
}

export interface FormInstanceDTO {
  id: string;
  primaryTitle: string;
  secondaryTitle: string;
  fieldsConfig: FieldConfig[];
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
  qrToken: string | null;
  qrExpiresAt: string | null;
  qrStatus: 'active' | 'expired' | null;
  checkinDeadline: string | null;
  bitableAppToken: string | null;
  bitableRecordsTableId: string | null;
  bitableViewId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitPayload {
  deviceId: string;
  fields: Record<string, string>;
  clientLat: number | null;
  clientLng: number | null;
  clientAccuracy: number | null;
}

export interface SubmitResult {
  success: boolean;
  alreadySubmitted?: boolean;
  outsideGeofence?: boolean;
  missingRequired?: string[];
  message?: string;
}

export interface FormStatusResponse {
  instance: FormInstanceDTO;
  alreadySubmitted: boolean;
  serverTime: string;
}