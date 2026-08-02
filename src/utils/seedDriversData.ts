/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Driver } from '../types';

const CLIENTS = [
  { id: 'CL-AIRINDIA', name: 'Air India T3' },
];

const CITIES = ['Bangalore', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Chennai', 'Pune'];
const OFFICES = ['Whitefield', 'Electronic City', 'Cyber City', 'HITEC City', 'OMR Phase 1', 'Viman Nagar'];

const FIRST_NAMES = [
  'Palwinder', 'Gurpreet', 'Rajesh', 'Suresh', 'Ramesh', 'Vijay', 'Amit', 'Sunil', 'Pankaj', 'Manoj', 'Deepak', 'Anil',
  'Vikram', 'Dharmendra', 'Sanjay', 'Rakesh', 'Mahesh', 'Ganesh', 'Dinesh', 'Ajay', 'Ashok', 'Arun',
  'Santosh', 'Praveen', 'Pradeep', 'Satish', 'Nilesh', 'Mukesh', 'Harish', 'Girish', 'Babu', 'Ketan',
  'Mohan', 'Subhash', 'Naveen', 'Ravindra', 'Vinod', 'Naresh', 'Tarun', 'Jitendra', 'Kiran', 'Lokesh',
  'Suraj', 'Chetan', 'Hemant', 'Kishore', 'Pawan', 'Rohit', 'Sachin', 'Umesh', 'Vishal', 'Yogesh',
  'Alok', 'Bharat', 'Chandan', 'Devendra', 'Gautam', 'Jagdish', 'Kartik', 'Lalit', 'Nitin', 'Prashant',
  'Rajendra', 'Shailendra', 'Tushar', 'Upendra', 'Varun', 'Yash', 'Abhay', 'Brijesh', 'Gopal', 'Kalyan',
  'Manish', 'Neeraj', 'Pankaj', 'Rajiv', 'Shankar', 'Harpreet', 'Sukhwinder'
];

const LAST_NAMES = [
  'Singh', 'Kumar', 'Sharma', 'Patil', 'Verma', 'Yadav', 'Rao', 'Gowda', 'Reddy', 'Nair',
  'Gupta', 'Joshi', 'Mishra', 'Chauhan', 'Pawar', 'Deshmukh', 'Kulkarni', 'Shetty', 'Pillai', 'Pandey'
];

export async function seedCompleteDriversDataset(): Promise<{ activeCount: number; inactiveCount: number }> {
  try {
    const existingSnap = await getDocs(collection(db, 'drivers'));
    
    // We will generate a complete set of 72 Active and 17 Inactive Drivers
    const deleteBatch = writeBatch(db);

    // Delete ALL existing driver records to cleanly re-populate the complete dataset without duplicates
    existingSnap.forEach(dDoc => {
      deleteBatch.delete(dDoc.ref);
    });
    await deleteBatch.commit();

    const batch = writeBatch(db);
    const timestamp = new Date().toISOString();

    // 1. Generate 72 Active Drivers
    for (let i = 1; i <= 72; i++) {
      const driverId = `DRV-ACT-${String(i).padStart(3, '0')}`;
      const docRef = doc(collection(db, 'drivers'));
      let firstName = FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
      let lastName = LAST_NAMES[(i * 3) % LAST_NAMES.length];
      if (i === 1) {
        firstName = 'Palwinder';
        lastName = 'Singh';
      }
      const name = `${firstName} ${lastName}`;
      const client = CLIENTS[(i - 1) % CLIENTS.length];
      const city = CITIES[(i - 1) % CITIES.length];
      const office = OFFICES[(i - 1) % OFFICES.length];

      const driverData: Driver = {
        driverId,
        name,
        clientId: client.id,
        clientName: client.name,
        status: 'active',
        overallComplianceStatus: 'Compliant',
        overallApprovalStatus: 'Approved',
        city,
        offices: office,
        driverLicenseNumber: `DL-${city.substring(0, 2).toUpperCase()}-20${15 + (i % 8)}-00${1000 + i}`,
        driverLicenseExpiryDate: `2027-0${(i % 9) + 1}-15`,
        inductionDate: `2022-0${(i % 9) + 1}-01`,
        badgeNumber: `BDG-${2000 + i}`,
        badgeExpiryDate: `2027-0${(i % 9) + 1}-20`,
        driverAge: 25 + (i % 30),
        backgroundCheckStatus: 'Verified',
        bgvExpiryDate: `2027-0${(i % 9) + 1}-10`,
        policeVerificationStatus: 'Verified',
        policeVerificationExpiryDate: `2027-0${(i % 9) + 1}-12`,
        phoneNumbers: `+91 9${800000000 + i * 1234}`,
        address: `${i * 12}, Sector ${i % 15}, ${city}`,
        currentAddress: `${i * 12}, Sector ${i % 15}, ${city}`,
        govtIdType: i % 2 === 0 ? 'Aadhaar' : 'PAN',
        govtIdNumber: i % 2 === 0 ? `7890 1234 ${5000 + i}` : `ABCDE${1000 + i}F`,
        medicalVerificationStatus: 'Verified',
        medicalVerificationExpiryDate: `2027-0${(i % 9) + 1}-05`,
        trainingVerificationStatus: 'Completed',
        trainingVerificationExpiryDate: `2027-0${(i % 9) + 1}-08`,
        comments: 'Driver fully compliant & active on client roster.',
        dateOfBirth: `19${80 + (i % 20)}-0${(i % 9) + 1}-15`,
        deactivationDate: '',
        inactivityReason: '',
        profileImageUrl: '',
        louDocumentUrl: '',
        eyeTestExpiryDate: `2027-0${(i % 9) + 1}-25`,
        approvedBy: 'Fleet Compliance Admin',
        approvedTime: timestamp,
        createdBy: 'System Seed Engine',
        createdTime: timestamp,
        updatedBy: 'System Seed Engine',
        updatedTime: timestamp,
        documentsUploaded: ['Driving_License.pdf', 'BGV_Clearance.pdf', 'Police_Verification.pdf', 'Medical_Fitness.pdf'],
      };

      batch.set(docRef, driverData);
    }

    // 2. Generate 17 Inactive Drivers with clear rectifiable reasons for inactiveness
    const INACTIVE_REASONS = [
      {
        reason: 'Driving License (DL) Expired. Renewal copy from RTO pending upload.',
        status: 'Non-Compliant',
        issueField: 'DL Expiry',
        approvalStatus: 'Rejected'
      },
      {
        reason: 'Background Verification (BGV) Clearance Expired. Verification agency report pending.',
        status: 'Non-Compliant',
        issueField: 'BGV Expired',
        approvalStatus: 'Suspended'
      },
      {
        reason: 'Police Verification Certificate (PVC) Expired. Local station acknowledgement required.',
        status: 'Non-Compliant',
        issueField: 'PVC Expired',
        approvalStatus: 'Suspended'
      },
      {
        reason: 'Annual Medical Fitness Certificate Expired. Authorized RTO doctor report required.',
        status: 'Non-Compliant',
        issueField: 'Medical Expired',
        approvalStatus: 'Rejected'
      },
      {
        reason: 'Bi-annual Eye Test Assessment Expired. Ophthalmologist vision report missing.',
        status: 'Non-Compliant',
        issueField: 'Eye Test Expired',
        approvalStatus: 'Rejected'
      },
      {
        reason: 'Commercial Driving Badge Expired. RTO Badge endorsement renewal required.',
        status: 'Non-Compliant',
        issueField: 'Badge Expired',
        approvalStatus: 'Rejected'
      },
      {
        reason: 'Deactivated as per Client request due to attendance policy breach.',
        status: 'Deactivated',
        issueField: 'Client Request',
        approvalStatus: 'Deactivated'
      },
      {
        reason: 'Driver Age limit exceeded 60 years maximum threshold under client transport policy.',
        status: 'Deactivated',
        issueField: 'Age Limit Exceeded',
        approvalStatus: 'Deactivated'
      },
      {
        reason: 'Signed Letter of Undertaking (LOU) and Code of Conduct document missing.',
        status: 'Pending Verification',
        issueField: 'LOU Missing',
        approvalStatus: 'Pending'
      },
      {
        reason: 'Defensive Driving & POSH Safety Training Certification expired.',
        status: 'Non-Compliant',
        issueField: 'Training Expired',
        approvalStatus: 'Suspended'
      },
      {
        reason: 'Driving License (DL) Expired on 10-Jan-2026. RTO renewal payment receipt provided, waiting for physical card.',
        status: 'Non-Compliant',
        issueField: 'DL Expiry',
        approvalStatus: 'Rejected'
      },
      {
        reason: 'Background Verification (BGV) flagged address mismatch requiring physical re-verification.',
        status: 'Non-Compliant',
        issueField: 'BGV Mismatch',
        approvalStatus: 'Suspended'
      },
      {
        reason: 'Police Verification re-submission required due to jurisdiction transfer.',
        status: 'Non-Compliant',
        issueField: 'PVC Transfer',
        approvalStatus: 'Suspended'
      },
      {
        reason: 'Medical fitness test deferred due to temporary vision correction recommendation.',
        status: 'Non-Compliant',
        issueField: 'Medical Deferred',
        approvalStatus: 'Rejected'
      },
      {
        reason: 'Aadhaar & Driving License name spelling mismatch in client portal.',
        status: 'Pending Verification',
        issueField: 'Doc Mismatch',
        approvalStatus: 'Pending'
      },
      {
        reason: 'Temporary suspension following safety speed limit alert investigation.',
        status: 'Deactivated',
        issueField: 'Safety Alert',
        approvalStatus: 'Suspended'
      },
      {
        reason: 'Commercial Badge renewal application submitted at RTO, endorsement pending.',
        status: 'Non-Compliant',
        issueField: 'Badge Renewal Pending',
        approvalStatus: 'Rejected'
      },
    ];

    for (let i = 1; i <= 17; i++) {
      const driverId = `DRV-INA-${String(i).padStart(3, '0')}`;
      const docRef = doc(collection(db, 'drivers'));
      const firstName = FIRST_NAMES[(i + 40) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(i + 5) % LAST_NAMES.length];
      const name = `${firstName} ${lastName}`;
      const client = CLIENTS[(i - 1) % CLIENTS.length];
      const city = CITIES[(i - 1) % CITIES.length];
      const office = OFFICES[(i - 1) % OFFICES.length];
      const issue = INACTIVE_REASONS[(i - 1) % INACTIVE_REASONS.length];

      const driverData: Driver = {
        driverId,
        name,
        clientId: client.id,
        clientName: client.name,
        status: 'inactive',
        overallComplianceStatus: issue.status,
        overallApprovalStatus: issue.approvalStatus,
        city,
        offices: office,
        driverLicenseNumber: `DL-${city.substring(0, 2).toUpperCase()}-2012-00${3000 + i}`,
        driverLicenseExpiryDate: issue.issueField === 'DL Expiry' ? '2025-12-15' : '2027-05-10',
        inductionDate: `2020-0${(i % 9) + 1}-01`,
        badgeNumber: `BDG-${8000 + i}`,
        badgeExpiryDate: issue.issueField.includes('Badge') ? '2025-11-20' : '2027-06-20',
        driverAge: issue.issueField === 'Age Limit Exceeded' ? 62 : 38,
        backgroundCheckStatus: issue.issueField.includes('BGV') ? 'Expired' : 'Verified',
        bgvExpiryDate: issue.issueField.includes('BGV') ? '2025-10-10' : '2027-04-10',
        policeVerificationStatus: issue.issueField.includes('PVC') ? 'Expired' : 'Verified',
        policeVerificationExpiryDate: issue.issueField.includes('PVC') ? '2025-09-12' : '2027-08-12',
        phoneNumbers: `+91 97${70000000 + i * 4321}`,
        address: `${i * 15}, Road ${i % 10}, ${city}`,
        currentAddress: `${i * 15}, Road ${i % 10}, ${city}`,
        govtIdType: 'PAN',
        govtIdNumber: `XYZDE${2000 + i}K`,
        medicalVerificationStatus: issue.issueField.includes('Medical') ? 'Expired' : 'Verified',
        medicalVerificationExpiryDate: issue.issueField.includes('Medical') ? '2025-12-01' : '2027-03-01',
        trainingVerificationStatus: issue.issueField.includes('Training') ? 'Expired' : 'Completed',
        trainingVerificationExpiryDate: issue.issueField.includes('Training') ? '2025-11-15' : '2027-02-15',
        comments: issue.reason,
        dateOfBirth: issue.issueField === 'Age Limit Exceeded' ? '1963-04-12' : '1985-08-20',
        deactivationDate: '2026-01-15',
        inactivityReason: issue.reason,
        profileImageUrl: '',
        louDocumentUrl: '',
        eyeTestExpiryDate: issue.issueField.includes('Eye') ? '2025-12-20' : '2027-07-25',
        approvedBy: 'Fleet Operations Supervisor',
        approvedTime: timestamp,
        createdBy: 'System Seed Engine',
        createdTime: timestamp,
        updatedBy: 'System Seed Engine',
        updatedTime: timestamp,
        documentsUploaded: ['Driving_License.pdf'],
      };

      batch.set(docRef, driverData);
    }

    await batch.commit();
    return { activeCount: 72, inactiveCount: 17 };
  } catch (err) {
    console.error('Error seeding complete drivers dataset:', err);
    throw err;
  }
}

export async function cleanUnwantedClients(): Promise<void> {
  try {
    const clientsSnap = await getDocs(collection(db, 'clients'));
    const unwantedNames = ['tech corp', 'techcorp', 'techcorp inc', 'global logistics', 'alpha retail'];
    const batch = writeBatch(db);
    let hasEdits = false;
    let hasAirIndia = false;

    clientsSnap.forEach(dDoc => {
      const cData = dDoc.data();
      const cName = (cData.clientName || cData.name || '').trim().toLowerCase();
      if (unwantedNames.some(u => cName.includes(u))) {
        batch.delete(dDoc.ref);
        hasEdits = true;
      }
      if (cName.includes('air india')) {
        hasAirIndia = true;
      }
    });

    if (!hasAirIndia) {
      const newRef = doc(collection(db, 'clients'));
      batch.set(newRef, {
        clientName: 'Air India T3',
        clientId: 'CL-AIRINDIA',
        createdAt: new Date().toISOString()
      });
      hasEdits = true;
    }

    // Also update any drivers/cabs pointing to unwanted client names to Air India T3
    const driversSnap = await getDocs(collection(db, 'drivers'));
    driversSnap.forEach(dDoc => {
      const dData = dDoc.data();
      const cName = (dData.clientName || '').trim().toLowerCase();
      if (unwantedNames.some(u => cName.includes(u))) {
        batch.update(dDoc.ref, {
          clientName: 'Air India T3',
          clientId: 'CL-AIRINDIA'
        });
        hasEdits = true;
      }
    });

    const cabsSnap = await getDocs(collection(db, 'cabs'));
    cabsSnap.forEach(cDoc => {
      const cData = cDoc.data();
      const cName = (cData.clientName || '').trim().toLowerCase();
      if (unwantedNames.some(u => cName.includes(u))) {
        batch.update(cDoc.ref, {
          clientName: 'Air India T3',
          clientId: 'CL-AIRINDIA'
        });
        hasEdits = true;
      }
    });

    if (hasEdits) {
      await batch.commit();
      console.log('[Cleanup] Successfully purged TechCorp, Global Logistics, and Alpha Retail. Assigned to Air India T3.');
    }
  } catch (err) {
    console.error('Error cleaning unwanted clients:', err);
  }
}

let isSeedingInProgress = false;

export async function ensureCompleteDriversDataset(): Promise<void> {
  if (isSeedingInProgress) return;
  try {
    isSeedingInProgress = true;
    await cleanUnwantedClients();
    const existingSnap = await getDocs(collection(db, 'drivers'));

    // Check for duplicate driver IDs or wrong document count
    const driverIdsSet = new Set<string>();
    let hasDuplicateIds = false;

    existingSnap.docs.forEach(docSnap => {
      const dId = String(docSnap.data().driverId || docSnap.id).trim().toLowerCase();
      if (driverIdsSet.has(dId)) {
        hasDuplicateIds = true;
      } else {
        driverIdsSet.add(dId);
      }
    });

    if (existingSnap.size !== 89 || hasDuplicateIds) {
      console.log(`[Auto-Parse] Resetting drivers database to exact 72 Active + 17 Inactive Drivers roster (current size: ${existingSnap.size}, duplicates: ${hasDuplicateIds})...`);
      await seedCompleteDriversDataset();
    }
  } catch (err) {
    console.error('Auto-seed complete drivers failed:', err);
  } finally {
    isSeedingInProgress = false;
  }
}

