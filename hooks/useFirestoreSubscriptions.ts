import React, { useState, useEffect, useRef } from 'react';
import {
  View, InventoryItem, Office, UserProfile, UserRole, SystemLog, AccessLog, SystemSettings
} from '../types';
import { db } from '../firebase';
import {
  collection, onSnapshot, query, orderBy, addDoc, deleteDoc,
  doc, setDoc, where, getDocs, updateDoc, deleteField
} from 'firebase/firestore';
import { OFFICIAL_LGU_INVENTORY } from '../officialLguData';
import { handleFirestoreError, OperationType } from '../lib/errors';

const INITIAL_OFFICES: Office[] = [
  { id: '1', name: "Mayor's Office", code: '101' },
  { id: '2', name: "Accounting & Finance", code: '1081' },
  { id: '3', name: "Municipal Engineering", code: '8711' },
  { id: '4', name: "Health & Nutrition", code: '4411' },
  { id: '5', name: "Assessor's Office", code: '1101' },
  { id: '6', name: "MDRRMO", code: '9911' },
  { id: '7', name: "Planning & Development", code: '1041' },
  { id: '8', name: "Information Technology", code: '1011' },
  { id: '9', name: "Agriculture", code: '8712' },
  { id: '10', name: "Social Welfare", code: '4412' },
];

export interface UseFirestoreSubscriptionsReturn {
  rawItems: any[];
  masterAssets: any[];
  offices: Office[];
  systemLogs: SystemLog[];
  accessLogs: AccessLog[];
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  setOffices: React.Dispatch<React.SetStateAction<Office[]>>;
  setRawItems: React.Dispatch<React.SetStateAction<any[]>>;
  setMasterAssets: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useFirestoreSubscriptions(
  isAuthenticated: boolean,
  userProfile: UserProfile,
  addSystemLog: (action: string, module: string) => Promise<void>
): UseFirestoreSubscriptionsReturn {
  const [rawItems, setRawItems] = useState<any[]>([]);
  const [masterAssets, setMasterAssets] = useState<any[]>([]);
  const [offices, setOffices] = useState<Office[]>(INITIAL_OFFICES);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    municipality: 'Tibiao',
    province: 'Antique',
    fiscalYear: '2024-2025',
    systemVersion: 'v3.5.2-Cloud',
    lastBackup: new Date().toLocaleDateString()
  });

  const hasSeededItems = useRef(false);
  const hasSeededOffices = useRef(false);
  const hasSeededLguInventory = useRef(false);
  const hasMigrated = useRef(false);

  // ── Settings Subscription ──
  useEffect(() => {
    if (isAuthenticated && db) {
      const globalSettingsRef = doc(db, 'system_settings', 'global');
      const unsubscribeGlobal = onSnapshot(globalSettingsRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSettings(prev => ({
            ...prev,
            municipality: data.municipality || 'Tibiao',
            province: data.province || 'Antique',
            fiscalYear: data.fiscalYear || '2024-2025'
          }));
        } else if (userProfile.role === UserRole.ADMIN) {
          setDoc(globalSettingsRef, {
            municipality: 'Tibiao', province: 'Antique', fiscalYear: '2024-2025',
            systemVersion: 'v3.5.2-Cloud', lastBackup: new Date().toLocaleDateString()
          }).catch((err) => console.error('Failed to initialize global settings:', err));
        }
      }, (error) => console.error('Error in global settings snapshot listener:', error));

      return () => { unsubscribeGlobal(); };
    }
  }, [isAuthenticated, userProfile.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Database Migration ──
  const migrateDatabase = async (existingItems: InventoryItem[]) => {
    if (hasMigrated.current) return;
    hasMigrated.current = true;
    console.log("[Data Normalizer] Starting structural database migration...");

    try {
      const masterSnapshot = await getDocs(collection(db, 'master_assets'));
      const existingMasters = masterSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const masterMap = new Map<string, any>();
      existingMasters.forEach(m => {
        if (m.propertyNumber) masterMap.set(m.propertyNumber.toLowerCase().trim(), m);
      });

      let migrationCount = 0;

      for (const item of existingItems) {
        if (item.masterAssetId) continue;

        const propKey = (item.propertyNumber || '').toLowerCase().trim();
        let masterId = '';
        let foundMaster = propKey ? masterMap.get(propKey) : null;

        if (!foundMaster && item.serialNumber) {
          foundMaster = existingMasters.find(m => m.serialNumber && m.serialNumber.toLowerCase().trim() === item.serialNumber?.toLowerCase().trim());
        }
        if (!foundMaster) {
          foundMaster = existingMasters.find(m => m.article && m.article.toLowerCase().trim() === item.article?.toLowerCase().trim());
        }

        if (foundMaster) {
          masterId = foundMaster.id;
        } else {
          const masterDocRef = doc(collection(db, 'master_assets'));
          masterId = masterDocRef.id;
          const cost = Number(item.acquisitionCost || item.unitValue || 0);
          const classification = cost >= 50000 ? 'PAR' : 'ICS';

          const newMasterPayload = {
            propertyNumber: item.propertyNumber || `SNAP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            article: (item.article || 'Discovered Item').toUpperCase(),
            description: item.description || '',
            category: item.category || 'Other Assets',
            brand: (item as any).brand || '',
            modelNumber: item.modelNumber || '',
            serialNumber: item.serialNumber || '',
            unitOfMeasure: item.unitOfMeasure || 'unit',
            unitValue: Number(item.unitValue || cost) || 0,
            acquisitionCost: Number(item.acquisitionCost || cost) || 0,
            acquisitionDate: item.acquisitionDate || '',
            supplier: item.supplier || '',
            warrantyExpiration: item.warrantyExpiration || '',
            usefulLife: Number(item.usefulLife) || 5,
            assetCode: item.assetCode || '',
            classification,
            isFixed: Boolean((item as any).isFixed),
            isFixedMaster: Boolean((item as any).isFixedMaster)
          };

          await setDoc(masterDocRef, newMasterPayload);
          masterMap.set(newMasterPayload.propertyNumber.toLowerCase().trim(), { id: masterId, ...newMasterPayload });
          existingMasters.push({ id: masterId, ...newMasterPayload });
        }

        const itemRef = doc(db, 'inventory_items', item.id);
        const itemUpdates: any = { masterAssetId: masterId };
        const fieldsToDelete = [
          'article', 'description', 'propertyNumber', 'category', 'brand', 'modelNumber',
          'serialNumber', 'unitOfMeasure', 'unitValue', 'acquisitionCost', 'acquisitionDate',
          'supplier', 'warrantyExpiration', 'usefulLife', 'assetCode', 'classification', 'isFixed', 'isFixedMaster'
        ];
        fieldsToDelete.forEach(field => { itemUpdates[field] = deleteField(); });
        await updateDoc(itemRef, itemUpdates);
        migrationCount++;
      }

      if (migrationCount > 0) {
        addSystemLog(`Successfully normalized and optimized ${migrationCount} inventory records!`, 'System');
      }
    } catch (err) {
      console.error("[Data Normalizer] Error migrating database:", err);
    }
  };

  // ── LGU Data Seeding ──
  const seedOfficialLguData = async (existingItems: InventoryItem[]) => {
    if (hasSeededLguInventory.current) return;
    hasSeededLguInventory.current = true;
    console.log("[LGU Seeder] Starting normalized check for missing official master records...");
    let newInsertedCount = 0;

    try {
      for (const item of OFFICIAL_LGU_INVENTORY) {
        const masterAssetsCol = collection(db, 'master_assets');
        const qProp = query(masterAssetsCol, where('propertyNumber', '==', item.propertyNumber));
        const snapProp = await getDocs(qProp);

        let masterId = '';
        if (!snapProp.empty) {
          masterId = snapProp.docs[0].id;
        } else {
          const masterDocRef = doc(masterAssetsCol);
          masterId = masterDocRef.id;
          const cost = Number(item.unitValue) || 0;
          const classification = cost >= 50000 ? 'PAR' : 'ICS';

          await setDoc(masterDocRef, {
            propertyNumber: item.propertyNumber,
            article: item.article.toUpperCase(),
            description: item.description || '',
            category: item.category,
            brand: '', modelNumber: '', serialNumber: '',
            unitOfMeasure: item.unitOfMeasure || '',
            unitValue: Number(item.unitValue) || 0,
            acquisitionCost: Number(item.unitValue * item.qtyPhysicalCount) || 0,
            acquisitionDate: item.acquisitionDate || '',
            supplier: '', warrantyExpiration: '', usefulLife: 5, assetCode: '',
            classification, isFixed: true, isFixedMaster: true
          });
        }

        const isDuplicate = existingItems.some(existing =>
          existing.masterAssetId === masterId &&
          (existing.office || '').trim().toLowerCase() === (item.office || '').trim().toLowerCase()
        );

        if (!isDuplicate) {
          await addDoc(collection(db, 'inventory_items'), {
            masterAssetId: masterId,
            personAccountable: "Jocelyn Manzan",
            office: item.office,
            qtyPropertyCard: Number(item.qtyPropertyCard) || 0,
            qtyPhysicalCount: Number(item.qtyPhysicalCount) || 0,
            condition: item.condition,
            status: item.status,
            remarks: item.remarks,
            createdAt: new Date().toISOString(),
            history: [{
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              user: "Official Seeder",
              action: 'Official Registry Import',
              details: 'Imported as Approved System Master Data from MDRRMO Inventory Sheet'
            }],
            imageUrls: []
          });
          newInsertedCount++;
        }
      }
    } catch (err) {
      console.error("[LGU Seeder] Error seeding official LGU data:", err);
    }

    if (newInsertedCount > 0) {
      addSystemLog(`Imported ${newInsertedCount} official LGU Master Data asset(s) successfully!`, 'System');
    }
  };

  // ── Demo Data Seeding ──
  const seedDemoData = async () => {
    const demoItems = [
      { article: 'DELL LATITUDE 5420', category: 'ICT Equipment', office: "Mayor's Office", unitValue: 45000, qtyPhysicalCount: 5, propertyNumber: 'LGU-ICT-2024-001' },
      { article: 'EPSON L3210 PRINTER', category: 'ICT Equipment', office: "Accounting & Finance", unitValue: 9500, qtyPhysicalCount: 3, propertyNumber: 'LGU-ICT-2024-002' },
      { article: 'OFFICE DESK - MAHOGANY', category: 'Furniture & Fixtures', office: "Assessor's Office", unitValue: 12000, qtyPhysicalCount: 10, propertyNumber: 'LGU-FUR-2024-005' },
      { article: 'TOYOTA HILUX 4X4', category: 'Transportation Equipment', office: "MDRRMO", unitValue: 1850000, qtyPhysicalCount: 1, propertyNumber: 'LGU-VEH-2024-001' },
      { article: 'SPLIT TYPE AC - 2.0HP', category: 'Office Equipment', office: "Municipal Engineering", unitValue: 35000, qtyPhysicalCount: 4, propertyNumber: 'LGU-OFF-2024-010' },
      { article: 'SWIVEL CHAIR - ERGONOMIC', category: 'Furniture & Fixtures', office: "Health & Nutrition", unitValue: 4500, qtyPhysicalCount: 15, propertyNumber: 'LGU-FUR-2024-012' },
      { article: 'LENOVO THINKCENTRE M70', category: 'ICT Equipment', office: "MDRRMO", unitValue: 38000, qtyPhysicalCount: 2, propertyNumber: 'LGU-ICT-2024-015' },
      { article: 'HP PROLIANT DL380 GEN10', category: 'ICT Equipment', office: "Information Technology", unitValue: 285000, qtyPhysicalCount: 1, propertyNumber: 'LGU-ICT-2024-020' },
      { article: 'LEICA TS07 TOTAL STATION', category: 'Office Equipment', office: "Municipal Engineering", unitValue: 420000, qtyPhysicalCount: 1, propertyNumber: 'LGU-ENG-2024-003' },
      { article: 'KUBOTA L5018 TRACTOR', category: 'Other Assets', office: "Agriculture", unitValue: 1250000, qtyPhysicalCount: 1, propertyNumber: 'LGU-AGR-2024-045' },
      { article: 'CANON IMAGECLASS MF644CDW', category: 'ICT Equipment', office: "Social Welfare", unitValue: 22000, qtyPhysicalCount: 2, propertyNumber: 'LGU-SWD-2024-008' },
      { article: 'MODULAR OFFICE CUBICLE', category: 'Furniture & Fixtures', office: "Planning & Development", unitValue: 15000, qtyPhysicalCount: 6, propertyNumber: 'LGU-PLAN-2024-012' },
      { article: 'FIRE EXTINGUISHER - ABC 10LBS', category: 'Safety Equipment', office: "Health & Nutrition", unitValue: 3800, qtyPhysicalCount: 8, propertyNumber: 'LGU-SAF-2024-022' },
      { article: 'MOTOROLA TALKABOUT T800', category: 'Communication Equipment', office: "MDRRMO", unitValue: 6500, qtyPhysicalCount: 20, propertyNumber: 'LGU-COM-2024-014' },
      { article: 'HOSPITAL BED - HYDRAULIC', category: 'Medical Equipment', office: "Health & Nutrition", unitValue: 55000, qtyPhysicalCount: 4, propertyNumber: 'LGU-MED-2024-009' },
      { article: 'ISUZU D-MAX PICKUP', category: 'Transportation Equipment', office: "Municipal Engineering", unitValue: 1650000, qtyPhysicalCount: 1, propertyNumber: 'LGU-VEH-2024-002' },
      { article: 'CONFERENCE TABLE - 12 SEATER', category: 'Furniture & Fixtures', office: "Mayor's Office", unitValue: 25000, qtyPhysicalCount: 1, propertyNumber: 'LGU-FUR-2024-025' },
      { article: 'CCTV SYSTEM - 16 CHANNEL', category: 'Security Equipment', office: "Information Technology", unitValue: 68000, qtyPhysicalCount: 1, propertyNumber: 'LGU-SEC-2024-018' },
      { article: 'MICROSCOPE - BINOCULAR', category: 'Agricultural Equipment', office: "Agriculture", unitValue: 18000, qtyPhysicalCount: 2, propertyNumber: 'LGU-AGR-2024-011' },
      { article: 'DOCUMENT SCANNER - HIGH SPEED', category: 'Office Equipment', office: "Accounting & Finance", unitValue: 24000, qtyPhysicalCount: 2, propertyNumber: 'LGU-OFF-2024-033' },
      { article: 'AIR PURIFIER - INDUSTRIAL', category: 'Health Equipment', office: "Health & Nutrition", unitValue: 12500, qtyPhysicalCount: 6, propertyNumber: 'LGU-HEA-2024-004' },
      { article: 'UPS - 10KVA RACKMOUNT', category: 'ICT Equipment', office: "Information Technology", unitValue: 85000, qtyPhysicalCount: 2, propertyNumber: 'LGU-ICT-2024-025' },
      { article: 'WATER PUMP - 5HP DIESEL', category: 'Agricultural Equipment', office: "Agriculture", unitValue: 32000, qtyPhysicalCount: 5, propertyNumber: 'LGU-AGR-2024-015' },
      { article: 'DRONE - MAPPING EDITION', category: 'ICT Equipment', office: "Planning & Development", unitValue: 145000, qtyPhysicalCount: 1, propertyNumber: 'LGU-PLAN-2024-001' },
      { article: 'PORTABLE RADIOLOGY UNIT', category: 'Medical Equipment', office: "Health & Nutrition", unitValue: 850000, qtyPhysicalCount: 1, propertyNumber: 'LGU-MED-2024-012' },
      { article: 'GENSET - 50KVA SILENT', category: 'Other Assets', office: "Municipal Engineering", unitValue: 650000, qtyPhysicalCount: 1, propertyNumber: 'LGU-ENG-2024-008' },
      { article: 'SOLAR STREET LIGHTS', category: 'Infrastructure Assets', office: "Municipal Engineering", unitValue: 8500, qtyPhysicalCount: 50, propertyNumber: 'LGU-INFRA-2024-001' },
      { article: 'BIOMETRIC TIME RECORDER', category: 'ICT Equipment', office: "Mayor's Office", unitValue: 12000, qtyPhysicalCount: 3, propertyNumber: 'LGU-ICT-2024-040' },
      { article: 'FIRE TRUCK - 4000L', category: 'Transportation Equipment', office: "MDRRMO", unitValue: 4500000, qtyPhysicalCount: 1, propertyNumber: 'LGU-VEH-2024-100' },
      { article: 'WHEELCHAIR - HEAVY DUTY', category: 'Medical Equipment', office: "Social Welfare", unitValue: 7500, qtyPhysicalCount: 10, propertyNumber: 'LGU-SWD-2024-022' },
      { article: 'CADASTRAL MAP PLOTTER', category: 'ICT Equipment', office: "Assessor's Office", unitValue: 185000, qtyPhysicalCount: 1, propertyNumber: 'LGU-ASS-2024-009' },
    ];

    try {
      for (const item of demoItems) {
        const masterAssetsCol = collection(db, 'master_assets');
        const propertyNumber = item.propertyNumber;
        const article = item.article.trim().toUpperCase();

        // Find or create master
        const qProp = query(masterAssetsCol, where('propertyNumber', '==', propertyNumber));
        const snapProp = await getDocs(qProp);
        let masterId = '';

        if (!snapProp.empty) {
          masterId = snapProp.docs[0].id;
        } else {
          const qArticle = query(masterAssetsCol, where('article', '==', article));
          const snapArticle = await getDocs(qArticle);

          if (!snapArticle.empty) {
            masterId = snapArticle.docs[0].id;
          } else {
            const masterDocRef = doc(masterAssetsCol);
            masterId = masterDocRef.id;
            const cost = item.unitValue || 0;
            const classification = cost >= 50000 ? 'PAR' : 'ICS';

            await setDoc(masterDocRef, {
              propertyNumber, article,
              description: `Standard ${item.category} for LGU operations.`,
              category: item.category,
              brand: '', modelNumber: '', serialNumber: '',
              unitOfMeasure: 'unit',
              unitValue: cost,
              acquisitionCost: cost * item.qtyPhysicalCount,
              acquisitionDate: '',
              supplier: '', warrantyExpiration: '', usefulLife: 5, assetCode: '',
              classification, isFixed: true, isFixedMaster: true
            });
          }
        }

        await addDoc(collection(db, 'inventory_items'), {
          masterAssetId: masterId,
          qtyPropertyCard: item.qtyPhysicalCount,
          qtyPhysicalCount: item.qtyPhysicalCount,
          office: item.office,
          personAccountable: userProfile.fullName,
          history: [{
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: userProfile.fullName,
            action: 'System Seeding'
          }],
          imageUrls: []
        });
      }
      addSystemLog('System Population: Demo Assets Generated in Cloud', 'System');
    } catch (error) {
      console.error("Failed to seed demo data:", error);
    }
  };

  // ── Core Data Subscriptions ──
  useEffect(() => {
    if (!isAuthenticated || !db || !userProfile.role || userProfile.role === UserRole.UNAUTHORIZED) {
      return;
    }

    const itemsPath = 'inventory_items';
    let itemsQ;
    if (userProfile.role === UserRole.ADMIN ||
        userProfile.role === UserRole.SUPPLY ||
        userProfile.role === UserRole.ACCOUNTING ||
        userProfile.role === UserRole.MAYOR) {
      itemsQ = query(collection(db, itemsPath));
    } else {
      itemsQ = query(collection(db, itemsPath), where('office', '==', userProfile.office));
    }

    const unsubscribeItems = onSnapshot(itemsQ, (snapshot) => {
      const fetchedItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setRawItems(fetchedItems);

      const unmigrated = fetchedItems.filter(item => !item.masterAssetId);
      if (unmigrated.length > 0) migrateDatabase(fetchedItems);

      if (userProfile.role === UserRole.ADMIN) seedOfficialLguData(fetchedItems);

      if (fetchedItems.length === 0 && userProfile.role === UserRole.ADMIN && !hasSeededItems.current) {
        hasSeededItems.current = true;
        seedDemoData();
      } else {
        hasSeededItems.current = true;
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, itemsPath);
    });

    const masterQ = query(collection(db, 'master_assets'));
    const unsubscribeMasters = onSnapshot(masterQ, (snapshot) => {
      setMasterAssets(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'master_assets');
    });

    const officesQ = query(collection(db, 'offices'), orderBy('name', 'asc'));
    const unsubscribeOffices = onSnapshot(officesQ, (snapshot) => {
      const fetchedOffices = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Office[];

      const deduplicated: Office[] = [];
      const seenNames = new Set<string>();
      const seenCodes = new Set<string>();
      const duplicatesToDelete: string[] = [];

      fetchedOffices.forEach(office => {
        const nameNorm = (office.name || '').trim().toLowerCase();
        const codeNorm = (office.code || '').trim().toLowerCase();
        if (!nameNorm) return;
        if (seenNames.has(nameNorm) || (codeNorm && seenCodes.has(codeNorm))) {
          duplicatesToDelete.push(office.id);
        } else {
          deduplicated.push(office);
          seenNames.add(nameNorm);
          if (codeNorm) seenCodes.add(codeNorm);
        }
      });

      setOffices(deduplicated);

      if (userProfile.role === UserRole.ADMIN && duplicatesToDelete.length > 0) {
        duplicatesToDelete.forEach(async (dupId) => {
          try { await deleteDoc(doc(db, 'offices', dupId)); }
          catch (err) { console.error(`Failed to clean up duplicate office ${dupId}:`, err); }
        });
      }

      if (fetchedOffices.length === 0 && userProfile.role === UserRole.ADMIN && !hasSeededOffices.current) {
        hasSeededOffices.current = true;
        INITIAL_OFFICES.forEach(async (office) => {
          const { id, ...officeData } = office;
          try { await addDoc(collection(db, 'offices'), officeData); }
          catch (err) { console.error('Failed to seed office:', err); }
        });
      } else {
        hasSeededOffices.current = true;
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'offices');
    });

    let unsubscribeLogs: (() => void) | null = null;
    if (userProfile.role === UserRole.ADMIN || userProfile.role === UserRole.ACCOUNTING ||
        userProfile.role === UserRole.SUPPLY || userProfile.role === UserRole.MAYOR) {
      const logsQ = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'));
      unsubscribeLogs = onSnapshot(logsQ, (snapshot) => {
        setSystemLogs(snapshot.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString() };
        }) as SystemLog[]);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'system_logs'));
    }

    let unsubscribeAccess: (() => void) | null = null;
    if (userProfile.role === UserRole.ADMIN) {
      const accessQ = query(collection(db, 'access_logs'), orderBy('timestamp', 'desc'));
      unsubscribeAccess = onSnapshot(accessQ, (snapshot) => {
        setAccessLogs(snapshot.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString() };
        }) as AccessLog[]);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'access_logs'));
    }

    return () => {
      unsubscribeItems();
      unsubscribeMasters();
      unsubscribeOffices();
      if (unsubscribeLogs) unsubscribeLogs();
      if (unsubscribeAccess) unsubscribeAccess();
    };
  }, [isAuthenticated, userProfile.role, userProfile.office]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Service Worker Cache ──
  useEffect(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      if (rawItems.length > 0 || masterAssets.length > 0) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_INVENTORY', payload: { rawItems, masterAssets }
        });
      }
    }
  }, [rawItems, masterAssets]);

  return {
    rawItems, masterAssets, offices, systemLogs, accessLogs, settings, setSettings, setOffices, setRawItems, setMasterAssets,
  };
}
