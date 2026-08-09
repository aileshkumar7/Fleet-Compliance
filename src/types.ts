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
  type: 'driver' | 'cab';
  changeType: 'added' | 'updated' | 'status_changed';
  oldStatus?: string;
  newStatus?: string;
  details: string;
}

export interface UploadLog {
  id: string;
  batchId?: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  recordCounts: number;
  details?: {
    driversAdded: number;
    driversUpdated: number;
    cabsAdded: number;
    cabsUpdated: number;
    failedRowsCount: number;
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
  uploadedAt: Date | any;
}


