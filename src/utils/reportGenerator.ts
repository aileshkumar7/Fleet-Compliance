/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Cab, Driver, Client } from '../types';
import { analyzeCabExpiry, analyzeDriverExpiry, getDocumentStatus } from './expiryEngine';

export interface ReportFilterOptions {
  clientFilter: string; // 'all' or clientId
  statusFilter: 'all' | 'active' | 'inactive';
  alertStatusFilter: 'all' | 'expiring_soon' | 'expired' | 'all_alerts';
}

/**
 * Logs a report download action to Firestore for audit trail
 */
export async function logReportDownload(
  downloadedBy: string,
  reportType: 'excel_full' | 'pdf_single',
  fileName: string,
  filtersUsed: Record<string, any>,
  recordCount: number
) {
  try {
    await addDoc(collection(db, 'reportLogs'), {
      downloadedBy: downloadedBy || 'Admin User',
      reportType,
      fileName,
      filtersUsed,
      recordCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to log report download in Firestore:', err);
  }
}

/**
 * Helper to match record against Client filter
 */
function matchClient(recordClientName?: string, recordClientId?: string, filterValue?: string): boolean {
  if (!filterValue || filterValue === 'all') return true;
  const f = filterValue.toLowerCase();
  return (recordClientName || '').toLowerCase() === f || (recordClientId || '').toLowerCase() === f;
}

/**
 * Helper to match record status filter
 */
function matchStatus(recordStatus?: string, filterValue?: string): boolean {
  if (!filterValue || filterValue === 'all') return true;
  return (recordStatus || '').toLowerCase() === filterValue.toLowerCase();
}

/**
 * Formats a list of expiring/expired document alerts as a readable string
 */
function formatExpiringDocsSummary(alerts: Array<{ docName: string; status: string; daysRemaining: number }>): string {
  if (!alerts || alerts.length === 0) return 'None';
  return alerts
    .map(a => {
      if (a.status === 'expired') {
        return `${a.docName} (expired)`;
      } else {
        return `${a.docName} (${a.daysRemaining} days)`;
      }
    })
    .join(', ');
}

/**
 * Generates and downloads an Excel file (.xlsx) with Cabs and Drivers sheets based on filters
 */
export async function exportFleetExcelReport(
  cabs: Cab[],
  drivers: Driver[],
  filters: ReportFilterOptions,
  downloadedBy: string,
  clientList: Client[] = []
): Promise<{ fileName: string; cabCount: number; driverCount: number }> {
  // 1. Filter Cabs
  const filteredCabs = cabs.filter(cab => {
    if (!matchClient(cab.clientName, cab.clientId, filters.clientFilter)) return false;
    if (!matchStatus(cab.status, filters.statusFilter)) return false;

    const analysis = analyzeCabExpiry(cab);
    if (filters.alertStatusFilter === 'expired') return analysis.worstStatus === 'expired';
    if (filters.alertStatusFilter === 'expiring_soon') return analysis.worstStatus === 'expiring_soon';
    if (filters.alertStatusFilter === 'all_alerts') return analysis.hasAlert;

    return true;
  });

  // 2. Filter Drivers
  const filteredDrivers = drivers.filter(driver => {
    if (!matchClient(driver.clientName, driver.clientId, filters.clientFilter)) return false;
    if (!matchStatus(driver.status, filters.statusFilter)) return false;

    const analysis = analyzeDriverExpiry(driver);
    if (filters.alertStatusFilter === 'expired') return analysis.worstStatus === 'expired';
    if (filters.alertStatusFilter === 'expiring_soon') return analysis.worstStatus === 'expiring_soon';
    if (filters.alertStatusFilter === 'all_alerts') return analysis.hasAlert;

    return true;
  });

  // 3. Build Cabs Sheet Rows
  const cabRows = filteredCabs.map(cab => {
    const analysis = analyzeCabExpiry(cab);
    const alertLabel = analysis.worstStatus === 'expired' ? 'Expired' : analysis.worstStatus === 'expiring_soon' ? 'Expiring Soon' : 'OK';
    const expiringDocsText = formatExpiringDocsSummary(analysis.alerts);

    return {
      'ETS Vehicle ID': cab.etsVehicleId || '',
      'Registration Number': cab.registrationNumber || '',
      'Client ID': cab.clientId || '',
      'Client Name': cab.clientName || '',
      'Vehicle Type': cab.vehicleType || '',
      'Status': cab.status || 'active',
      'Alert Status': alertLabel,
      'Expiring Documents': expiringDocsText,
      'Overall Compliance Status': cab.overallComplianceStatus || 'Compliant',
      'Manufacturing Date': cab.manufacturingDate || '',
      'Registration Date': cab.registrationDate || '',
      'Vehicle Age (Years)': cab.ageYears ?? '',
      'Induction Date': cab.inductionDate || '',
      'Insurance Expiry Date': cab.insuranceExpiryDate || '',
      'Pollution Certificate Expiry Date': cab.pollutionCertificateExpiryDate || '',
      'Permit Expiry Date': cab.permitExpiryDate || '',
      'Road Tax Expiry Date': cab.roadTaxExpiryDate || '',
      'Fitness Expiry Date': cab.fitnessExpiryDate || '',
      'Vehicle Service Expiry Date': cab.vehicleServiceExpiryDate || '',
      'Fuel Type': cab.fuelType || '',
      'Vehicle Ownership': cab.vehicleOwnership || '',
      'Assigned Driver Name': cab.driverName || '',
      'Assigned Driver Phone': cab.driverMobileNumber || '',
      'Driver Compliance Status': cab.driverComplianceStatus || '',
      'EHS': cab.ehs || '',
      'Comments': cab.comments || '',
      'Approved By': cab.approvedBy || '',
      'Created Time': cab.createdTime || '',
    };
  });

  // 4. Build Drivers Sheet Rows
  const driverRows = filteredDrivers.map(driver => {
    const analysis = analyzeDriverExpiry(driver);
    const alertLabel = analysis.worstStatus === 'expired' ? 'Expired' : analysis.worstStatus === 'expiring_soon' ? 'Expiring Soon' : 'OK';
    const expiringDocsText = formatExpiringDocsSummary(analysis.alerts);

    return {
      'Driver ID': driver.driverId || '',
      'Driver Name': driver.name || '',
      'Client ID': driver.clientId || '',
      'Client Name': driver.clientName || '',
      'Status': driver.status || 'active',
      'Alert Status': alertLabel,
      'Expiring Documents': expiringDocsText,
      'Overall Compliance Status': driver.overallComplianceStatus || 'Compliant',
      'City': driver.city || '',
      'Offices': driver.offices || '',
      'Driver License Number': driver.driverLicenseNumber || '',
      'Driver License Expiry Date': driver.driverLicenseExpiryDate || '',
      'Badge Number': driver.badgeNumber || '',
      'Badge Expiry Date': driver.badgeExpiryDate || '',
      'Age': driver.driverAge ?? '',
      'Background Check Status': driver.backgroundCheckStatus || '',
      'BGV Expiry Date': driver.bgvExpiryDate || '',
      'Police Verification Status': driver.policeVerificationStatus || '',
      'Police Verification Expiry Date': driver.policeVerificationExpiryDate || '',
      'Medical Verification Expiry Date': driver.medicalVerificationExpiryDate || '',
      'Training Verification Expiry Date': driver.trainingVerificationExpiryDate || '',
      'Eye Test Expiry Date': driver.eyeTestExpiryDate || '',
      'Phone Number': driver.phoneNumbers || '',
      'Address': driver.address || '',
      'Current Address': driver.currentAddress || '',
      'Date of Birth': driver.dateOfBirth || '',
      'Induction Date': driver.inductionDate || '',
      'Approved By': driver.approvedBy || '',
      'Created Time': driver.createdTime || '',
    };
  });

  // 5. Create Workbook with 2 Sheets
  const wb = XLSX.utils.book_new();
  const cabsWs = XLSX.utils.json_to_sheet(cabRows);
  const driversWs = XLSX.utils.json_to_sheet(driverRows);

  XLSX.utils.book_append_sheet(wb, cabsWs, 'Cabs');
  XLSX.utils.book_append_sheet(wb, driversWs, 'Drivers');

  // Format filename with timestamp
  const dateStr = new Date().toISOString().split('T')[0];
  let clientLabel = 'Fleet';
  if (filters.clientFilter && filters.clientFilter !== 'all') {
    const matched = clientList.find(c => c.clientId === filters.clientFilter || c.clientName === filters.clientFilter);
    clientLabel = matched ? matched.clientName.replace(/[^a-zA-Z0-9]/g, '_') : filters.clientFilter;
  }
  const fileName = `Fleet_Report_${clientLabel}_Cabs_Drivers_${dateStr}.xlsx`;

  // Write and trigger browser download
  XLSX.writeFile(wb, fileName);

  // Log audit
  await logReportDownload(downloadedBy, 'excel_full', fileName, filters, filteredCabs.length + filteredDrivers.length);

  return {
    fileName,
    cabCount: filteredCabs.length,
    driverCount: filteredDrivers.length,
  };
}

export async function exportRecordExcelReport(
  record: Cab | Driver,
  type: 'cab' | 'driver',
  downloadedBy: string
): Promise<string> {
  const dateStr = new Date().toISOString().split('T')[0];
  const wb = XLSX.utils.book_new();

  if (type === 'cab') {
    const cab = record as Cab;
    const analysis = analyzeCabExpiry(cab);
    const alertLabel = analysis.worstStatus === 'expired' ? 'Expired' : analysis.worstStatus === 'expiring_soon' ? 'Expiring Soon' : 'OK';
    const expiringDocsText = formatExpiringDocsSummary(analysis.alerts);

    const detailsRow = [{
      'ETS Vehicle ID': cab.etsVehicleId || '',
      'Registration Number': cab.registrationNumber || '',
      'Client ID': cab.clientId || '',
      'Client Name': cab.clientName || '',
      'Vehicle Type': cab.vehicleType || '',
      'Status': cab.status || 'active',
      'Alert Status': alertLabel,
      'Expiring Documents': expiringDocsText,
      'Overall Compliance Status': cab.overallComplianceStatus || 'Compliant',
      'Manufacturing Date': cab.manufacturingDate || '',
      'Registration Date': cab.registrationDate || '',
      'Vehicle Age (Years)': cab.ageYears ?? '',
      'Induction Date': cab.inductionDate || '',
      'Insurance Expiry Date': cab.insuranceExpiryDate || '',
      'Pollution Certificate Expiry Date': cab.pollutionCertificateExpiryDate || '',
      'Permit Expiry Date': cab.permitExpiryDate || '',
      'Road Tax Expiry Date': cab.roadTaxExpiryDate || '',
      'Fitness Expiry Date': cab.fitnessExpiryDate || '',
      'Vehicle Service Expiry Date': cab.vehicleServiceExpiryDate || '',
      'Fuel Type': cab.fuelType || '',
      'Vehicle Ownership': cab.vehicleOwnership || '',
      'Assigned Driver Name': cab.driverName || '',
      'Assigned Driver Phone': cab.driverMobileNumber || '',
      'Driver Compliance Status': cab.driverComplianceStatus || '',
      'EHS': cab.ehs || '',
      'Comments': cab.comments || '',
      'Approved By': cab.approvedBy || '',
      'Created Time': cab.createdTime || '',
    }];

    const cabDocs = [
      { name: 'Insurance', date: cab.insuranceExpiryDate },
      { name: 'Pollution Certificate (PUC)', date: cab.pollutionCertificateExpiryDate },
      { name: 'Permit', date: cab.permitExpiryDate },
      { name: 'Road Tax', date: cab.roadTaxExpiryDate },
      { name: 'Fitness Certificate', date: cab.fitnessExpiryDate },
    ];

    const docAuditRows = cabDocs.map(d => {
      const audit = getDocumentStatus(d.name, d.date);
      return {
        'Document Name': d.name,
        'Expiry Date': d.date || 'N/A',
        'Audit Status': audit.status === 'expired' ? 'EXPIRED' : audit.status === 'expiring_soon' ? 'EXPIRING SOON' : 'VALID',
        'Audit Details': audit.message,
      };
    });

    const detailsWs = XLSX.utils.json_to_sheet(detailsRow);
    const docAuditWs = XLSX.utils.json_to_sheet(docAuditRows);

    XLSX.utils.book_append_sheet(wb, detailsWs, 'Vehicle Details');
    XLSX.utils.book_append_sheet(wb, docAuditWs, 'Document Audit');

    const fileName = `Cab_Report_${(cab.registrationNumber || cab.etsVehicleId || 'Record').replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);

    await logReportDownload(downloadedBy, 'excel_single' as any, fileName, { type: 'cab', id: cab.etsVehicleId }, 1);
    return fileName;
  } else {
    const driver = record as Driver;
    const analysis = analyzeDriverExpiry(driver);
    const alertLabel = analysis.worstStatus === 'expired' ? 'Expired' : analysis.worstStatus === 'expiring_soon' ? 'Expiring Soon' : 'OK';
    const expiringDocsText = formatExpiringDocsSummary(analysis.alerts);

    const detailsRow = [{
      'Driver ID': driver.driverId || '',
      'Driver Name': driver.name || '',
      'Client ID': driver.clientId || '',
      'Client Name': driver.clientName || '',
      'Status': driver.status || 'active',
      'Alert Status': alertLabel,
      'Expiring Documents': expiringDocsText,
      'Overall Compliance Status': driver.overallComplianceStatus || 'Compliant',
      'City': driver.city || '',
      'Offices': driver.offices || '',
      'Driver License Number': driver.driverLicenseNumber || '',
      'Driver License Expiry Date': driver.driverLicenseExpiryDate || '',
      'Badge Number': driver.badgeNumber || '',
      'Badge Expiry Date': driver.badgeExpiryDate || '',
      'Age': driver.driverAge ?? '',
      'Background Check Status': driver.backgroundCheckStatus || '',
      'BGV Expiry Date': driver.bgvExpiryDate || '',
      'Police Verification Status': driver.policeVerificationStatus || '',
      'Police Verification Expiry Date': driver.policeVerificationExpiryDate || '',
      'Medical Verification Expiry Date': driver.medicalVerificationExpiryDate || '',
      'Training Verification Expiry Date': driver.trainingVerificationExpiryDate || '',
      'Eye Test Expiry Date': driver.eyeTestExpiryDate || '',
      'Phone Number': driver.phoneNumbers || '',
      'Address': driver.address || '',
      'Current Address': driver.currentAddress || '',
      'Date of Birth': driver.dateOfBirth || '',
      'Induction Date': driver.inductionDate || '',
      'Approved By': driver.approvedBy || '',
      'Created Time': driver.createdTime || '',
    }];

    const driverDocs = [
      { name: 'Driver License', num: driver.driverLicenseNumber, date: driver.driverLicenseExpiryDate },
      { name: 'BGV (Background Check)', num: driver.backgroundCheckStatus, date: driver.bgvExpiryDate },
      { name: 'Police Verification', num: driver.policeVerificationStatus, date: driver.policeVerificationExpiryDate },
      { name: 'Medical Check', num: driver.medicalVerificationStatus, date: driver.medicalVerificationExpiryDate },
    ];

    const docAuditRows = driverDocs.map(d => {
      const audit = getDocumentStatus(d.name, d.date);
      return {
        'Document Name': d.name,
        'Doc Ref / Status': d.num || 'N/A',
        'Expiry Date': d.date || 'N/A',
        'Audit Status': audit.status === 'expired' ? 'EXPIRED' : audit.status === 'expiring_soon' ? 'EXPIRING SOON' : 'VALID',
        'Audit Details': audit.message,
      };
    });

    const detailsWs = XLSX.utils.json_to_sheet(detailsRow);
    const docAuditWs = XLSX.utils.json_to_sheet(docAuditRows);

    XLSX.utils.book_append_sheet(wb, detailsWs, 'Driver Details');
    XLSX.utils.book_append_sheet(wb, docAuditWs, 'Document Audit');

    const fileName = `Driver_Report_${(driver.name || driver.driverId || 'Record').replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);

    await logReportDownload(downloadedBy, 'excel_single' as any, fileName, { type: 'driver', id: driver.driverId }, 1);
    return fileName;
  }
}

/**
 * Generates and downloads a single-record PDF summary report for a Cab or Driver
 */
export async function exportRecordPdfReport(
  record: Cab | Driver,
  type: 'cab' | 'driver',
  downloadedBy: string
): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const nowStr = new Date().toLocaleString();

  // Primary palette
  const headerBgColor: [number, number, number] = [30, 41, 59]; // slate-800
  const primaryAccent: [number, number, number] = [37, 99, 235]; // blue-600

  // 1. Header Banner
  doc.setFillColor(...headerBgColor);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FLEET COMPLIANCE PORTAL', 14, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(type === 'cab' ? 'Official Vehicle Compliance & Audit Report' : 'Official Driver Compliance & Audit Report', 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated on: ${nowStr}`, 145, 14);
  doc.text(`Generated by: ${downloadedBy}`, 145, 20);

  let yPos = 40;

  if (type === 'cab') {
    const cab = record as Cab;
    const fileName = `Cab_Report_${(cab.registrationNumber || cab.etsVehicleId || 'Record').replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;

    // Title Box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, yPos, 182, 18, 3, 3, 'F');

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`CAB RECORD: ${cab.registrationNumber || 'N/A'} (ETS ID: ${cab.etsVehicleId || 'N/A'})`, 18, yPos + 8);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Client Organization: ${cab.clientName || 'General Fleet'} (${cab.clientId || 'CL-01'}) | Status: ${cab.status || 'Active'}`, 18, yPos + 14);

    yPos += 24;

    // Vehicle Specifications Table
    autoTable(doc, {
      startY: yPos,
      head: [['Attribute', 'Details']],
      body: [
        ['ETS Vehicle ID', cab.etsVehicleId || 'N/A'],
        ['Registration Number', cab.registrationNumber || 'N/A'],
        ['Client Name (ID)', `${cab.clientName || 'N/A'} (${cab.clientId || 'N/A'})`],
        ['Vehicle Type / Fuel', `${cab.vehicleType || 'N/A'} / ${cab.fuelType || 'N/A'}`],
        ['Ownership / Age', `${cab.vehicleOwnership || 'N/A'} (${cab.ageYears !== undefined ? cab.ageYears + ' Yrs' : 'N/A'})`],
        ['Manufacturing / Reg Date', `Mfg: ${cab.manufacturingDate || 'N/A'} | Reg: ${cab.registrationDate || 'N/A'}`],
        ['Assigned Driver', `${cab.driverName || 'Unassigned'} (${cab.driverMobileNumber || 'N/A'})`],
      ],
      theme: 'grid',
      headStyles: { fillColor: primaryAccent, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: 30 },
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;

    // Compliance Documents Table
    const cabDocs = [
      { name: 'Insurance', date: cab.insuranceExpiryDate },
      { name: 'Pollution Certificate (PUC)', date: cab.pollutionCertificateExpiryDate },
      { name: 'Permit', date: cab.permitExpiryDate },
      { name: 'Road Tax', date: cab.roadTaxExpiryDate },
      { name: 'Fitness Certificate', date: cab.fitnessExpiryDate },
    ];

    const docBody = cabDocs.map(d => {
      const audit = getDocumentStatus(d.name, d.date);
      let statusLabel = 'VALID';
      if (audit.status === 'expired') statusLabel = 'EXPIRED';
      if (audit.status === 'expiring_soon') statusLabel = 'EXPIRING SOON';

      return [d.name, d.date || 'N/A', statusLabel, audit.message];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Document Name', 'Expiry Date', 'Audit Status', 'Details']],
      body: docBody,
      theme: 'striped',
      headStyles: { fillColor: headerBgColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 30 },
        2: { cellWidth: 32, fontStyle: 'bold' },
        3: { cellWidth: 70 },
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 2) {
          if (data.cell.raw === 'EXPIRED') {
            data.cell.styles.textColor = [225, 29, 72]; // rose
          } else if (data.cell.raw === 'EXPIRING SOON') {
            data.cell.styles.textColor = [217, 119, 6]; // amber
          } else {
            data.cell.styles.textColor = [16, 185, 129]; // emerald
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 12;

    // Signatures & Disclaimer
    doc.setLineWidth(0.3);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, yPos, 196, yPos);

    yPos += 8;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('This is a computer-generated compliance verification report from Fleet Management System.', 14, yPos);
    doc.text(`Verified By System Admin: ${cab.approvedBy || downloadedBy}`, 14, yPos + 5);

    doc.save(fileName);
    await logReportDownload(downloadedBy, 'pdf_single', fileName, { type: 'cab', id: cab.etsVehicleId }, 1);
    return fileName;
  } else {
    const driver = record as Driver;
    const fileName = `Driver_Report_${(driver.name || driver.driverId || 'Record').replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;

    // Title Box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, yPos, 182, 18, 3, 3, 'F');

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`DRIVER RECORD: ${driver.name || 'N/A'} (ID: ${driver.driverId || 'N/A'})`, 18, yPos + 8);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Client: ${driver.clientName || 'General Fleet'} | City: ${driver.city || 'N/A'} | Status: ${driver.status || 'Active'}`, 18, yPos + 14);

    yPos += 24;

    // Driver Personal Info Table
    autoTable(doc, {
      startY: yPos,
      head: [['Attribute', 'Details']],
      body: [
        ['Driver Name', driver.name || 'N/A'],
        ['Driver ID', driver.driverId || 'N/A'],
        ['Client Name (ID)', `${driver.clientName || 'N/A'} (${driver.clientId || 'N/A'})`],
        ['Phone Number', driver.phoneNumbers || 'N/A'],
        ['City & Office Hub', `${driver.city || 'N/A'} - ${driver.offices || 'N/A'}`],
        ['Address', driver.address || 'N/A'],
        ['Govt ID', `${driver.govtIdType || 'ID'}: ${driver.govtIdNumber || 'N/A'}`],
        ['Date of Birth / Age', `${driver.dateOfBirth || 'N/A'} (${driver.driverAge ? driver.driverAge + ' Yrs' : 'N/A'})`],
      ],
      theme: 'grid',
      headStyles: { fillColor: primaryAccent, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: 30 },
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;

    // Compliance Documents Table
    const driverDocs = [
      { name: 'Driver License', num: driver.driverLicenseNumber, date: driver.driverLicenseExpiryDate },
      { name: 'BGV (Background Check)', num: driver.backgroundCheckStatus, date: driver.bgvExpiryDate },
      { name: 'Police Verification', num: driver.policeVerificationStatus, date: driver.policeVerificationExpiryDate },
      { name: 'Medical Check', num: driver.medicalVerificationStatus, date: driver.medicalVerificationExpiryDate },
    ];

    const docBody = driverDocs.map(d => {
      const audit = getDocumentStatus(d.name, d.date);
      let statusLabel = 'VALID';
      if (audit.status === 'expired') statusLabel = 'EXPIRED';
      if (audit.status === 'expiring_soon') statusLabel = 'EXPIRING SOON';

      return [d.name, d.num || 'N/A', d.date || 'N/A', statusLabel, audit.message];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Document Name', 'Doc Ref', 'Expiry Date', 'Status', 'Audit Details']],
      body: docBody,
      theme: 'striped',
      headStyles: { fillColor: headerBgColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        1: { cellWidth: 35 },
        2: { cellWidth: 26 },
        3: { cellWidth: 28, fontStyle: 'bold' },
        4: { cellWidth: 51 },
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 3) {
          if (data.cell.raw === 'EXPIRED') {
            data.cell.styles.textColor = [225, 29, 72];
          } else if (data.cell.raw === 'EXPIRING SOON') {
            data.cell.styles.textColor = [217, 119, 6];
          } else {
            data.cell.styles.textColor = [16, 185, 129];
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 12;

    doc.setLineWidth(0.3);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, yPos, 196, yPos);

    yPos += 8;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('This is a computer-generated compliance verification report from Fleet Management System.', 14, yPos);
    doc.text(`Verified By System Admin: ${driver.approvedBy || downloadedBy}`, 14, yPos + 5);

    doc.save(fileName);
    await logReportDownload(downloadedBy, 'pdf_single', fileName, { type: 'driver', id: driver.driverId }, 1);
    return fileName;
  }
}
