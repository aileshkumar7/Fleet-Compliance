/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Driver {
  id?: string;
  name: string;
  clientName: string;
  overallComplianceStatus: string;
  city: string;
  offices: string;
  driverLicenseNumber: string;
  driverLicenseExpiryDate: string;
  driverId: string;
  inductionDate: string;
  badgeNumber: string;
  badgeExpiryDate: string;
  driverAge: number;
  backgroundCheckStatus: string;
  bgvExpiryDate: string;
  policeVerificationStatus: string;
  policeVerificationExpiryDate: string;
  overallApprovalStatus: string;
  phoneNumbers: string;
  address: string;
  currentAddress: string;
  govtIdType: string;
  govtIdNumber: string;
  medicalVerificationStatus: string;
  medicalVerificationExpiryDate: string;
  trainingVerificationStatus: string;
  trainingVerificationExpiryDate: string;
  comments: string;
  dateOfBirth: string;
  deactivationDate: string;
  inactivityReason?: string;
  profileImageUrl: string;
  louDocumentUrl: string;
  eyeTestExpiryDate: string;
  approvedBy: string;
  approvedTime: string;
  createdBy: string;
  createdTime: string;
  updatedBy: string;
  updatedTime: string;
  documentsUploaded: string[];
  status: 'active' | 'inactive' | string;
  clientId: string;
  assignedCab?: string;
  vehicleNumber?: string;
  uploadBatchId?: string;
  uploadBatchFileName?: string;
}

export interface Cab {
  id?: string;
  etsVehicleId: string;
  registrationNumber: string;
  registrationNormalized?: string;
  clientName: string;
  vehicleType: string;
  overallComplianceStatus: string;
  manufacturingDate: string;
  registrationDate: string;
  ageYears: number;
  inductionDate: string;
  durationYears: number;
  insuranceExpiryDate: string;
  pollutionCertificateExpiryDate: string;
  permitExpiryDate: string;
  roadTaxExpiryDate: string;
  fitnessExpiryDate: string;
  vehicleServiceExpiryDate: string;
  ehs: string;
  documentsUploaded: string[];
  comments: string;
  overallApprovalStatus: string;
  fuelType: string;
  vehicleOwnership: string;
  permitType: string;
  deactivationDate: string;
  inactivityReason?: string;
  otherDocuments: string;
  approvedBy: string;
  approvedTime: string;
  createdBy: string;
  createdTime: string;
  updatedBy: string;
  updatedTime: string;
  contractName: string;
  driverName: string;
  driverMobileNumber: string;
  driverComplianceStatus: string;
  status: 'active' | 'inactive' | string;
  clientId: string;
  uploadBatchId?: string;
  uploadBatchFileName?: string;
}

export interface Client {
  id?: string;
  clientId: string;
  clientName: string;
}

export interface UploadChangeRecord {
  recordId?: string;
  identifier: string;
  type: 'driver' | 'cab' | 'trip' | string;
  changeType: 'added' | 'updated' | 'status_changed';
  oldStatus?: string;
  newStatus?: string;
  details: string;
}

export interface UploadLog {
  id: string;
  batchId?: string;
  fileName: string;
  uploadType?: 'drivers' | 'cabs' | 'all' | 'trips' | string;
  uploadedBy: string;
  uploadedAt: string;
  recordCounts: number;
  details?: {
    driversAdded?: number;
    driversUpdated?: number;
    cabsAdded?: number;
    cabsUpdated?: number;
    tripsAdded?: number;
    tripsUpdated?: number;
    duplicateRowsCollapsed?: number;
    failedRowsCount?: number;
    totalRowsRead?: number;
  };
  changes?: UploadChangeRecord[];
}

export interface UserPermissions {
  viewCabs: boolean;
  viewDrivers: boolean;
  viewExpiryAlerts: boolean;
  uploadDataSheets: boolean;
}

export interface UserProfile {
  id?: string;
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  clientId?: string; // Bound client ID for 'user' role
  assignedClientIds: string[]; // ['all'] or array containing single clientId
  permissions: UserPermissions;
  createdAt?: string;
  createdBy?: string;
}

export interface UserActivityLog {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  clientId: string;
  event: 'login' | 'logout';
  timestamp: string;
  sessionId: string;
}

export interface ZoneMappingRule {
  id?: string;
  type: 'pincode' | 'locality';
  pattern: string; // 6-digit pincode (e.g. "110037") or locality keyword (e.g. "NANGLOI")
  zoneName: string; // Target zone (e.g. "South West", "North West")
  description?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TripRosterEntry {
  id?: string;
  tripId: string;
  cabNumber: string;
  loginTimeText: string;
  serviceDate: string;
  vendorName?: string;
  sNo: string;
  loginId: string;
  name: string;
  gender: string;
  address: string;
  office: string;
  rawLocationText: string;
  contact: string;
  extractedPincode?: string;
  zone: string; // Resolved zone or "Unmapped — Needs Review"
  zoneMatchMethod?: 'pincode' | 'locality' | 'unmapped';
  matchedRulePattern?: string;
  clientId: string;
  clientName?: string;
  uploadedBy: string;
  uploadedAt: string;
  uploadBatchId: string;
  uploadFileName?: string;
}

export interface TripBlockSummary {
  tripId: string;
  cabNumber: string;
  loginTimeText: string;
  serviceDate: string;
  vendorName: string;
  passengerCountExpected: number;
  passengerCountActual: number;
  isCountMatched: boolean;
  headerRowIndex: number;
  passengers: {
    sNo: string;
    loginId: string;
    name: string;
    gender: string;
    address: string;
    office: string;
    rawLocationText: string;
    contact: string;
    extractedPincode?: string;
    zone: string;
    zoneMatchMethod?: 'pincode' | 'locality' | 'unmapped';
    matchedRulePattern?: string;
  }[];
}

export interface Trip {
  id?: string; // Document ID = tripId
  tripId: string;
  date: Date | any; // Firestore Timestamp / Date
  registration: string;
  vehicleId: string;
  vehicleType: string;
  direction: string;
  tripType: string;
  deploymentTime: Date | any;
  actualPickupTime: Date | any;
  actualDropTime: Date | any;
  passengerCount: number;
  driverName: string;
  driverContactNo: string;
  facility: string;
  office: string;
  costCenter: string;
  clientId: string;
  clientName?: string;
  uploadedAt: Date | any;
  uploadBatchId?: string;
  uploadBatchFileName?: string;
}


