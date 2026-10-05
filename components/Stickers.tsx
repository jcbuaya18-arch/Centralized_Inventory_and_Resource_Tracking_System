import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem, UserRole } from '../types';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';

interface StickersProps {
  items: InventoryItem[];
  userRole: UserRole;
  userName: string;
  onUpdateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
}

interface StickerConfig {
  accountableName: string;
  accountablePosition: string;
}

/**
 * Prints only the property stickers inside `containerId` (not the rest of the app page)
 * by copying them into a hidden iframe that carries the app's stylesheets.
 */
const printStickersOnly = (containerId: string) => {
  const container = document.getElementById(containerId);
  const stickers = container ? Array.from(container.querySelectorAll('.pis-sticker')) : [];
  if (stickers.length === 0) {
    alert('No property stickers to print.');
    return;
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(node => node.outerHTML)
    .join('\n');
  const columns = stickers.length > 1 ? 2 : 1;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const printDoc = iframe.contentDocument;
  const printWin = iframe.contentWindow;
  if (!printDoc || !printWin) {
    iframe.remove();
    return;
  }

  printDoc.open();
  printDoc.write(`<!doctype html><html><head><meta charset="utf-8">
<base href="${window.location.origin}/">
<title>Property Inventory Stickers</title>
${styles}
<style>
  @page { size: landscape; margin: 10mm; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .pis-print-sheet {
    display: grid !important;
    grid-template-columns: repeat(${columns}, 120mm);
    justify-content: center;
    gap: 8mm;
  }
  .pis-print-sheet .pis-sticker { width: 120mm !important; max-width: none !important; margin: 0 !important; }
</style>
</head><body><div class="pis-print-sheet">${stickers.map(s => s.outerHTML).join('')}</div></body></html>`);
  printDoc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  const images = Array.from(printDoc.images);
  const imagesReady = Promise.all(images.map(img => img.complete
    ? Promise.resolve()
    : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve(); })));

  imagesReady.then(() => {
    printWin.focus();
    printWin.print();
    cleanup();
  });
};

const Stickers: React.FC<StickersProps> = ({ items, userRole, userName, onUpdateItem }) => {
  const [activeTab, setActiveTab] = useState<'stickers' | 'scanner' | 'backfill'>('stickers');
  const [selectedItemId, setSelectedItemId] = useState<string>(items[0]?.id || '');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printMode, setPrintMode] = useState<'single' | 'selected' | 'all'>('single');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedItem = items.find(i => i.id === selectedItemId);

  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter(item => 
      (item.article || '').toLowerCase().includes(query) ||
      (item.propertyNumber || '').toLowerCase().includes(query) ||
      (item.category || '').toLowerCase().includes(query) ||
      (item.office || '').toLowerCase().includes(query) ||
      (item.personAccountable || '').toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  const handleToggleSelectItem = (itemId: string) => {
    setSelectedItemIds(prev => {
      const isSelected = prev.includes(itemId);
      const next = isSelected ? prev.filter(id => id !== itemId) : [...prev, itemId];
      // Automatically switch print mode based on selection
      if (next.length > 0 && printMode === 'single') {
        setPrintMode('selected');
      } else if (next.length === 0 && printMode === 'selected') {
        setPrintMode('single');
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    const visibleIds = filteredItems.map(i => i.id);
    const allVisibleSelected = visibleIds.every(id => selectedItemIds.includes(id));

    if (allVisibleSelected) {
      // Uncheck all visible items
      setSelectedItemIds(prev => prev.filter(id => !visibleIds.includes(id)));
      if (printMode === 'selected') {
        setPrintMode('single');
      }
    } else {
      // Check all visible items
      setSelectedItemIds(prev => {
        const next = Array.from(new Set([...prev, ...visibleIds]));
        setPrintMode('selected');
        return next;
      });
    }
  };

  const handlePrintAll = async () => {
    try {
      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Printed All ${items.length} Asset Stickers`,
        module: 'Stickers Module'
      });
    } catch (e) {
      console.error("Log error:", e);
    }
    printStickersOnly('sticker-sheet');
  };

  const handlePrintSelected = async () => {
    const selectedItems = items.filter(i => selectedItemIds.includes(i.id));
    if (selectedItems.length > 0) {
      try {
        await addDoc(collection(db, 'system_logs'), {
          timestamp: new Date().toISOString(),
          user: userName,
          action: `Printed ${selectedItems.length} Selected Asset Stickers`,
          module: 'Stickers Module'
        });
      } catch (e) {
        console.error("Log error:", e);
      }
    }
    printStickersOnly('sticker-sheet');
  };

  // QR Scanner States
  const [scannedAssetId, setScannedAssetId] = useState<string>('');
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null);
  const [interactiveLog, setInteractiveLog] = useState<string>('');

  // Scanner actions
  const [newStatus, setNewStatus] = useState<string>('');
  const [newStaff, setNewStaff] = useState<string>('');
  const [newAccountable, setNewAccountable] = useState<string>('');

  // Legit Camera Scanner States
  const [scanType, setScanType] = useState<'camera' | 'upload' | 'simulate'>('camera');
  const [useCamera, setUseCamera] = useState<boolean>(false);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const [stickerConfig, setStickerConfig] = useState<StickerConfig>({
    accountableName: '',
    accountablePosition: 'Property Officer'
  });

  useEffect(() => {
    if (selectedItem) {
      setStickerConfig(prev => ({
        ...prev,
        accountableName: selectedItem.personAccountable || ''
      }));
    }
  }, [selectedItemId]);

  const handleConfigChange = (field: keyof StickerConfig, value: string) => {
    setStickerConfig(prev => ({ ...prev, [field]: value }));
  };

  const handlePrint = async () => {
    // Add audit log for printing
    if (selectedItem) {
      try {
        await addDoc(collection(db, 'system_logs'), {
          timestamp: new Date().toISOString(),
          user: userName,
          action: `Printed Official Asset Sticker for ${selectedItem.article}`,
          module: 'Stickers Module'
        });
      } catch (e) {
        console.error("Log error:", e);
      }
    }
    printStickersOnly('sticker-preview');
  };

  const parseScannedResult = (decodedText: string) => {
    try {
      const parsed = JSON.parse(decodedText);
      if (parsed && typeof parsed === 'object') {
        if (parsed.propertyNumber) return parsed.propertyNumber;
        if (parsed.id) return parsed.id;
      }
    } catch (e) {
      // Not a JSON string
    }
    return decodedText.trim();
  };

  const startCameraScanning = (instance: Html5Qrcode, cameraId: string) => {
    if (isScanning) return;
    setIsScanning(true);
    setInteractiveLog("Initializing live camera stream...");
    
    instance.start(
      cameraId,
      {
        fps: 12,
        qrbox: (width, height) => {
          const size = Math.min(width, height) * 0.75;
          return { width: size, height: size };
        }
      },
      (decodedText) => {
        setInteractiveLog(`QR successfully decoded!`);
        const matchedId = parseScannedResult(decodedText);
        setScannedAssetId(matchedId);
        
        const matched = items.find(i => i.id === matchedId || i.propertyNumber === matchedId);
        if (matched) {
          setScannedItem(matched);
          setNewStatus(matched.status || 'AVAILABLE');
          setNewStaff(matched.assignedStaff || '');
          setNewAccountable(matched.personAccountable || '');
          setInteractiveLog(`Asset record resolved! MATCHED: ${matched.article} (${matched.propertyNumber})`);
          // Stop camera scanning after successful result
          stopCameraScanning();
          setUseCamera(false);
        } else {
          setInteractiveLog(`QR payload recognized, but no matching asset in database: "${matchedId}"`);
        }
      },
      () => {
        // Silent error callback during search
      }
    ).catch(err => {
      console.error("Error starting camera scan:", err);
      setIsScanning(false);
      setInteractiveLog(`Camera error: ${err.message || err}`);
    });
  };

  const stopCameraScanning = () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      html5QrCodeRef.current.stop()
        .then(() => {
          setIsScanning(false);
          setInteractiveLog("Live camera stream stopped.");
        })
        .catch(err => {
          console.error("Error stopping camera session:", err);
        });
    } else {
      setIsScanning(false);
    }
  };

  const handleCameraChange = (cameraId: string) => {
    setSelectedCameraId(cameraId);
    if (html5QrCodeRef.current) {
      if (html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop()
          .then(() => {
            setIsScanning(false);
            startCameraScanning(html5QrCodeRef.current!, cameraId);
          })
          .catch(err => console.error(err));
      } else {
        startCameraScanning(html5QrCodeRef.current!, cameraId);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    setInteractiveLog("Processing image upload scanning...");

    const tempId = "upload-reader";
    let tempDiv = document.getElementById(tempId);
    if (!tempDiv) {
      tempDiv = document.createElement('div');
      tempDiv.id = tempId;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = '450px';
      tempDiv.style.height = '450px';
      tempDiv.style.overflow = 'hidden';
      document.body.appendChild(tempDiv);
    }

    const html5Qr = new Html5Qrcode(tempId);

    const onScanSuccess = (decodedText: string) => {
      setInteractiveLog("Image QR decoded successfully.");
      const matchedId = parseScannedResult(decodedText);
      setScannedAssetId(matchedId);
      
      const matched = items.find(i => i.id === matchedId || i.propertyNumber === matchedId);
      if (matched) {
        setScannedItem(matched);
        setNewStatus(matched.status || 'AVAILABLE');
        setNewStaff(matched.assignedStaff || '');
        setNewAccountable(matched.personAccountable || '');
        setInteractiveLog(`Asset found from QR upload! MATCHED: ${matched.article} (${matched.propertyNumber})`);
      } else {
        setInteractiveLog(`QR code processed, but no matching asset in LGU Tibiao registry: "${matchedId}"`);
      }
      try { html5Qr.clear(); } catch (clErr) {}
    };

    // Attempt 1: Direct raw file scan
    html5Qr.scanFile(file, true)
      .then(onScanSuccess)
      .catch(err => {
        console.warn("Attempt 1: Direct scan failed, trying downscaled fallback...", err);
        setInteractiveLog("Enhancing image resolution & contrast for fallback scan...");

        // Attempt 2: Resize to max 800px and scan
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            let w = img.width;
            let h = img.height;
            const maxDim = 800;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              setUploadError("Could not detect standard QR Code. Please make sure the photograph is centered, in focus, and has good lighting.");
              setInteractiveLog("QR Code recognition failed (Canvas context error).");
              try { html5Qr.clear(); } catch (clErr) {}
              return;
            }

            ctx.drawImage(img, 0, 0, w, h);

            canvas.toBlob((blob) => {
              if (!blob) {
                setUploadError("Could not detect standard QR Code. Please make sure the photograph is centered, in focus, and has good lighting.");
                setInteractiveLog("QR Code recognition failed (Blob conversion error).");
                try { html5Qr.clear(); } catch (clErr) {}
                return;
              }

              const testFile = new File([blob], "resized.png", { type: "image/png" });
              const html5QrTest = new Html5Qrcode(tempId);
              
              html5QrTest.scanFile(testFile, false)
                .then(decodedText => {
                  onScanSuccess(decodedText);
                  try { html5QrTest.clear(); } catch (clErr) {}
                })
                .catch(err1 => {
                  console.warn("Attempt 2: Downsampled scan failed, trying B&W threshold fallback...", err1);
                  try { html5QrTest.clear(); } catch (clErr) {}

                  // Attempt 3: High contrast black & white
                  try {
                    const imgData = ctx.getImageData(0, 0, w, h);
                    const data = imgData.data;
                    for (let i = 0; i < data.length; i += 4) {
                      const r = data[i];
                      const g = data[i+1];
                      const b = data[i+2];
                      const v = (r * 0.2126 + g * 0.7152 + b * 0.0722);
                      const finalVal = v > 128 ? 255 : 0;
                      data[i] = finalVal;
                      data[i+1] = finalVal;
                      data[i+2] = finalVal;
                    }
                    ctx.putImageData(imgData, 0, 0);

                    canvas.toBlob((blobContrast) => {
                      if (!blobContrast) {
                        setUploadError("Could not detect standard QR Code. Please make sure the photograph is centered, in focus, and has good lighting.");
                        setInteractiveLog("QR Code recognition failed.");
                        return;
                      }

                      const contrastFile = new File([blobContrast], "contrast.png", { type: "image/png" });
                      const html5QrContrast = new Html5Qrcode(tempId);
                      
                      html5QrContrast.scanFile(contrastFile, false)
                        .then(decodedText => {
                          onScanSuccess(decodedText);
                          try { html5QrContrast.clear(); } catch (clErr) {}
                        })
                        .catch(err2 => {
                          console.error("Attempt 3: Contrast scan failed.", err2);
                          setUploadError("Could not detect standard QR Code. Please make sure the photograph is centered, in focus, and has good lighting. Tip: Frame the QR Code close and flat to the camera.");
                          setInteractiveLog("QR Code recognition failed after 3 attempts.");
                          try { html5QrContrast.clear(); } catch (clErr) {}
                        });
                    }, 'image/png');
                  } catch (contrastErr) {
                    console.error("Contrast filter error:", contrastErr);
                    setUploadError("Could not detect standard QR Code.");
                    setInteractiveLog("QR Code recognition failed.");
                  }
                });
            }, 'image/png');
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
  };

  useEffect(() => {
    if (activeTab === 'scanner' && scanType === 'camera' && useCamera) {
      const qrCodeId = "camera-reader";
      // Delay initialization slightly to guarantee DOM rendered
      const timer = setTimeout(() => {
        const element = document.getElementById(qrCodeId);
        if (!element) return;

        const instance = new Html5Qrcode(qrCodeId);
        html5QrCodeRef.current = instance;

        Html5Qrcode.getCameras()
          .then(cameras => {
            setAvailableCameras(cameras);
            setCameraPermissionGranted(true);
            if (cameras.length > 0) {
              const defaultCam = cameras[0].id;
              setSelectedCameraId(defaultCam);
              startCameraScanning(instance, defaultCam);
            } else {
              setInteractiveLog("No cameras found. Please use Photo Upload or Manual Simulator.");
            }
          })
          .catch(err => {
            console.error("Camera scan permission error:", err);
            setCameraPermissionGranted(false);
            setInteractiveLog("Camera access blocked. Please allow browser camera access or use Photo Upload fallback.");
          });
      }, 300);

      return () => {
        clearTimeout(timer);
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().catch(err => console.debug(err));
        }
      };
    } else {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(err => console.debug(err));
      }
    }
  }, [activeTab, scanType, useCamera]);

  const handleScanAction = () => {
    const matched = items.find(i => i.id === scannedAssetId || i.propertyNumber === scannedAssetId);
    if (matched) {
      setScannedItem(matched);
      setNewStatus(matched.status || 'AVAILABLE');
      setNewStaff(matched.assignedStaff || '');
      setNewAccountable(matched.personAccountable || '');
      setInteractiveLog(`Decoded property ID ${matched.propertyNumber} successfully.`);
    } else {
      setInteractiveLog(`No asset found with code: "${scannedAssetId}"`);
      setScannedItem(null);
    }
  };

  const handleSaveScannerUpdates = async () => {
    if (!scannedItem) return;
    try {
      const updates: Partial<InventoryItem> = {
        status: newStatus as any,
        assignedStaff: newStaff,
        personAccountable: newAccountable,
        history: [
          ...(scannedItem.history || []),
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: userName,
            action: `Asset Assignment Updated via QR Scan (Status: ${newStatus}, Assigned: ${newStaff || 'None'})`
          }
        ]
      };

      await onUpdateItem(scannedItem.id, updates);
      
      // Auto generate form for transfer if status or staff changes!
      if (newStatus === 'ASSIGNED' || newStaff !== scannedItem.assignedStaff) {
        await addDoc(collection(db, 'forms'), {
          type: 'ITR',
          itemId: scannedItem.id,
          itemArticle: scannedItem.article,
          propertyNumber: scannedItem.propertyNumber,
          userId: 'auth-user',
          userName: newStaff || 'Unassigned',
          office: scannedItem.office,
          department: 'Property & Supply Unit',
          quantity: 1,
          dateCreated: new Date().toISOString(),
          status: 'Approved',
          remarks: `Auto generated transfer slip on QR scan assignment.`
        });
      }

      // Add general audit trace
      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Modified Assignment of ${scannedItem.article} via QR terminal`,
        module: 'Asset Assignment'
      });

      setInteractiveLog('Meters and asset assignment successfully updated and forms synchronized!');
      // Reload scanned item
      setScannedItem({ ...scannedItem, ...updates });
    } catch (err) {
      console.error(err);
      setInteractiveLog('Failed to save settings to the Cloud database.');
    }
  };

  // Bulk Backfiller
  const itemsNeedingBackfill = items.filter(i => !i.status || !i.assignedStaff);
  const handleBulkBackfill = async () => {
    if (itemsNeedingBackfill.length === 0) {
      alert("All active database items are already configured!");
      return;
    }
    
    let updatedCount = 0;
    for (const item of itemsNeedingBackfill) {
      await onUpdateItem(item.id, {
        status: item.status || 'AVAILABLE',
        assignedStaff: item.assignedStaff || 'LGU Staff'
      });
      updatedCount++;
    }

    alert(`Successfully backfilled ${updatedCount} assets with active statuses and custodians.`);
    
    await addDoc(collection(db, 'system_logs'), {
      timestamp: new Date().toISOString(),
      user: userName,
      action: `Ran batch QR backfill for ${updatedCount} legacy assets`,
      module: 'Stickers Module'
    });
  };

  const StickerContent: React.FC<{ item?: InventoryItem; isFullSize?: boolean }> = ({ item, isFullSize = false }) => {
    const targetItem = item || selectedItem;
    if (!targetItem) return null;
    const orNA = (value?: string | number | null) => {
      const text = String(value ?? '').trim();
      return text || 'N/A';
    };
    // Only the acquisition year is shown, e.g. "2022"
    const acquisitionSource = String(targetItem.acquisitionDate || targetItem.dateReceived || targetItem.yearPurchased || '');
    const acquisitionDateCost = acquisitionSource.match(/\d{4}/)?.[0] || '';

    const rows: Array<[string, string]> = [
      ['Property Number', orNA(targetItem.propertyNumber)],
      ['Item', orNA(targetItem.article)],
      ['Description', orNA(targetItem.description)],
      ['Model Number', orNA(targetItem.modelNumber)],
      ['Serial Number', orNA(targetItem.serialNumber)],
      ['Acquisition Date Cost', orNA(acquisitionDateCost)],
      ['Person Accountable', orNA(targetItem.personAccountable)],
    ];

    return (
      <div className={`pis-sticker ${isFullSize ? 'pis-sticker-full' : ''}`}>
        <div className="pis-frame">
          {/* Seal panel */}
          <div className="pis-seal">
            <img src="/tibiaoLogo.jpg" alt="Official Seal of the Municipality of Tibiao" referrerPolicy="no-referrer" />
            <p>Republic of the Philippines</p>
            <p>Province of Antique</p>
            <p>Municipality of Tibiao</p>
          </div>

          {/* Labeled fields */}
          <div className="pis-fields">
            <div className="pis-title">Property Inventory Sticker</div>
            {rows.map(([label, value]) => (
              <div key={label} className="pis-row">
                <span className="pis-label">{label}:</span>
                <span className="pis-value">{value}</span>
              </div>
            ))}
          </div>

          {/* Blank boxes for the signature/date and notes, filled in by hand */}
          <div className="pis-signature" />
          <div className="pis-note" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Tab select header */}
      <div className="no-print bg-white rounded-[32px] md:rounded-[40px] border border-gray-100 shadow-sm p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 font-brand uppercase tracking-tight">QR Tag & Tracker Center</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Immutably bind physical assets to government compliance records</p>
        </div>
      </div>

      {activeTab === 'stickers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
          <div className="lg:col-span-1 space-y-6 no-print">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-brand font-black text-xs uppercase tracking-widest text-gray-950 mb-4 border-b border-gray-50 pb-2">Printing Configuration</h3>
              <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-150 mb-6">
                <button
                  type="button"
                  onClick={() => setPrintMode('single')}
                  className={`flex-1 py-2 text-center rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${printMode === 'single' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                >
                  Single Tag
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('selected')}
                  className={`flex-1 py-2 text-center rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${printMode === 'selected' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                >
                  Selected ({selectedItemIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('all')}
                  className={`flex-1 py-2 text-center rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${printMode === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                >
                  All Items
                </button>
              </div>

              <h3 className="font-brand font-black text-xs uppercase tracking-widest text-gray-950 mb-4 border-b border-gray-50 pb-2">Label Settings</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Accountable Name</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none"
                    value={stickerConfig.accountableName}
                    onChange={(e) => handleConfigChange('accountableName', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                <h3 className="font-brand font-black text-xs uppercase tracking-widest text-gray-950">Active Inventory</h3>
                {selectedItemIds.length > 0 && (
                  <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider">
                    {selectedItemIds.length} Checked
                  </span>
                )}
              </div>

              {/* Simple Search bar */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search inventory assets..."
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none placeholder:text-gray-400 text-gray-800"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Table list with bulk select column */}
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto pr-1 custom-scrollbar border border-gray-100 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[9px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100 sticky top-0 z-10">
                      <th className="p-3 w-10 text-center bg-gray-50">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                          checked={filteredItems.length > 0 && filteredItems.every(item => selectedItemIds.includes(item.id))}
                          onChange={handleToggleSelectAll}
                        />
                      </th>
                      <th className="p-3 bg-gray-50">Asset Description</th>
                      <th className="p-3 text-right bg-gray-50">Property No.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredItems.map(item => {
                      const isChecked = selectedItemIds.includes(item.id);
                      const isCurrentPreview = selectedItemId === item.id;
                      return (
                        <tr 
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          className={`text-[11px] transition-all cursor-pointer hover:bg-gray-50/80 ${isCurrentPreview ? 'bg-blue-50/40 font-semibold' : ''}`}
                        >
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                              checked={isChecked}
                              onChange={() => handleToggleSelectItem(item.id)}
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-gray-950 truncate max-w-[130px] uppercase leading-tight">{item.article}</div>
                            <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{item.category}</div>
                          </td>
                          <td className="p-3 text-right font-mono text-[9px] font-bold text-gray-500">
                            {item.propertyNumber}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-gray-400 font-black uppercase tracking-widest text-[9px]">
                          No match found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col items-center justify-center p-8 bg-gray-100/50 rounded-[48px] min-h-[550px] border border-dashed border-gray-200">
            {printMode === 'all' ? (
              <div className="space-y-10 flex flex-col items-center w-full">
                <div className="bg-blue-50 border border-blue-100/50 p-4 rounded-3xl w-full text-center no-print max-w-xl">
                  <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Complete Registry Print Sheet</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                    Showing stickers for all <strong>{items.length}</strong> registered assets. Use your browser print preview to download or print.
                  </p>
                </div>

                {/* Print Sheet Grid */}
                <div id="sticker-sheet" className="sticker-sheet grid grid-cols-1 md:grid-cols-2 w-full print:grid-cols-2">
                  {items.map(item => (
                    <StickerContent key={item.id} item={item} />
                  ))}
                </div>
                
                <div className="flex justify-center no-print">
                  <button 
                    onClick={handlePrintAll}
                    className="bg-blue-600 text-white px-12 py-4 rounded-[28px] font-black text-[11px] uppercase tracking-[0.22em] flex items-center space-x-3 shadow-2xl hover:bg-blue-700 transition-all active:scale-95 animate-pulse cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Print Complete Batch Sheet</span>
                  </button>
                </div>
              </div>
            ) : printMode === 'selected' ? (
              <div className="space-y-10 flex flex-col items-center w-full">
                <div className="bg-blue-50 border border-blue-100/50 p-5 rounded-3xl w-full text-center no-print flex flex-col sm:flex-row items-center justify-between gap-4 max-w-2xl">
                  <div className="text-left">
                    <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Custom Sticker Print Batch</p>
                    <p className="text-[11px] text-slate-500 font-semibold leading-relaxed mt-1">
                      Ready to generate property tags for the <strong>{selectedItemIds.length}</strong> items selected below.
                    </p>
                  </div>
                  {selectedItemIds.length > 0 && (
                    <button
                      onClick={handlePrintSelected}
                      className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] flex items-center space-x-2.5 shadow-xl hover:bg-blue-700 transition-all active:scale-95 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      <span>Print Selected Stickers</span>
                    </button>
                  )}
                </div>

                {selectedItemIds.length === 0 ? (
                  <div className="py-20 text-center text-gray-400 font-black uppercase tracking-[0.2em] text-[10px] no-print">
                    No stickers selected. Please use checkboxes in the inventory table on the left to select assets.
                  </div>
                ) : (
                  <>
                    {/* Print Sheet Grid */}
                    <div id="sticker-sheet" className="sticker-sheet grid grid-cols-1 md:grid-cols-2 w-full print:grid-cols-2">
                      {items.filter(item => selectedItemIds.includes(item.id)).map(item => (
                        <StickerContent key={item.id} item={item} />
                      ))}
                    </div>
                    
                    <div className="flex justify-center no-print">
                      <button 
                        onClick={handlePrintSelected}
                        className="bg-blue-600 text-white px-12 py-4 rounded-[28px] font-black text-[11px] uppercase tracking-[0.22em] flex items-center space-x-3 shadow-2xl hover:bg-blue-700 transition-all active:scale-95 cursor-pointer"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        <span>Print Selected ({selectedItemIds.length}) Stickers</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : selectedItem ? (
              <div className="space-y-10 flex flex-col items-center">
                <div id="sticker-preview" className="print:block">
                  <StickerContent />
                </div>
                
                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 no-print">
                  <button 
                    onClick={() => setShowPrintPreview(true)}
                    className="bg-white text-gray-900 border-2 border-gray-200 px-10 py-3 rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] flex items-center space-x-3 shadow-xl hover:bg-gray-50 transition-all active:scale-95 cursor-pointer"
                  >
                    <span>Full Sticker View</span>
                  </button>

                  <button 
                    onClick={handlePrint}
                    className="bg-blue-600 text-white px-10 py-3 rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] flex items-center space-x-3 shadow-2xl hover:bg-blue-700 transition-all active:scale-95 animate-pulse cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Print Verified Label</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-gray-400 font-black uppercase tracking-[0.3em] text-[10px]">Select an asset to generate property tag</div>
            )}
          </div>
        </div>
      ) : activeTab === 'scanner' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
          {/* Real & Virtual QR scan terminal */}
          <div className="lg:col-span-5 bg-white rounded-[32px] border border-gray-100 shadow-sm p-8 space-y-6">
            <div className="border-b border-gray-50 pb-4">
              <h3 className="font-brand font-black text-gray-900 text-sm uppercase tracking-widest">Active Scan Input</h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">Select and run property tag or card asset tracking</p>
            </div>

            {/* Scanning Mode Toggles */}
            <div className="flex bg-gray-150 p-1.5 rounded-2xl border border-gray-100 bg-gray-50">
              <button
                onClick={() => { setScanType('camera'); setUseCamera(false); stopCameraScanning(); }}
                className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${scanType === 'camera' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
              >
                📷 Live Webcam
              </button>
              <button
                onClick={() => { setScanType('upload'); setUseCamera(false); stopCameraScanning(); }}
                className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${scanType === 'upload' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
              >
                📁 QR Upload
              </button>
              <button
                onClick={() => { setScanType('simulate'); setUseCamera(false); stopCameraScanning(); }}
                className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${scanType === 'simulate' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
              >
                💻 Simulator
              </button>
            </div>

            <div className="space-y-5">
              {/* CAMERA SCANNER */}
              {scanType === 'camera' && (
                <div className="space-y-4">
                  {!useCamera ? (
                    <div className="p-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl text-center space-y-4">
                      <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-black uppercase text-gray-900">Camera Terminal Ready</h4>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">Utilize integrated cameras to instantly scan physical asset labels</p>
                      </div>
                      <button
                        onClick={() => setUseCamera(true)}
                        className="w-full py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all"
                      >
                        Activate Video Stream
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Live Camera Feed Panel */}
                      <div className="bg-slate-950 p-1 rounded-[24px] overflow-hidden border border-slate-800 shadow-2xl relative">
                        <div id="camera-reader" className="w-full aspect-square rounded-[20px] overflow-hidden bg-slate-950"></div>
                        
                        {isScanning && (
                          <>
                            {/* Scanning Animation lines */}
                            <div className="absolute inset-x-4 top-1/2 h-0.5 bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-bounce z-10"></div>
                            <div className="absolute top-4 left-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[8px] font-black px-2 py-1 rounded-full animate-pulse z-10">
                              ● LIVE SCAN MODE
                            </div>
                          </>
                        )}
                      </div>

                      {/* Camera Selector Dropdown */}
                      {availableCameras.length > 1 && (
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Active Lens</label>
                          <select
                            value={selectedCameraId}
                            onChange={(e) => handleCameraChange(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold"
                          >
                            {availableCameras.map((camera, idx) => (
                              <option key={camera.deviceId} value={camera.deviceId}>
                                {camera.label || `Camera ${idx + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <button
                        onClick={() => { setUseCamera(false); stopCameraScanning(); }}
                        className="w-full py-2.5 bg-gray-950 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all"
                      >
                        Deactivate Video Feed
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PHOTO UPLOAD SCANNER */}
              {scanType === 'upload' && (
                <div className="space-y-4">
                  <div className="p-8 border-2 border-dashed border-gray-200 bg-gray-50/50 rounded-3xl hover:bg-gray-50 transition-all relative flex flex-col items-center justify-center text-center space-y-4">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-black uppercase text-gray-900">Upload Ticket / Sticker Image</h4>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">Drag and drop, or tap to choose a photo of the QR sticker</p>
                    </div>
                  </div>

                  {uploadError && (
                    <div className="p-4 bg-red-50 text-red-700 border border-red-100 rounded-2xl text-[10px] font-bold uppercase">
                      ⚠️ {uploadError}
                    </div>
                  )}
                </div>
              )}

              {/* INTEGRATED MANUAL SIMULATOR */}
              {scanType === 'simulate' && (
                <div className="p-6 bg-gray-50 border border-gray-100 rounded-3xl space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Registered Asset</label>
                    <select
                      value={scannedAssetId}
                      onChange={e => setScannedAssetId(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-xs uppercase"
                    >
                      <option value="">-- Choose Asset to Scan --</option>
                      {items.map(i => (
                        <option key={i.id} value={i.id}>{i.article} ({i.propertyNumber})</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="flex-shrink mx-4 text-gray-400 font-black text-[8px] uppercase tracking-widest">or lookup manually</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Type Property or Asset code</label>
                    <input
                      type="text"
                      placeholder="Type property code or inventory ID..."
                      value={scannedAssetId}
                      onChange={e => setScannedAssetId(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-xs uppercase"
                    />
                  </div>

                  <button
                    onClick={handleScanAction}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-md"
                  >
                    Resolve Asset Records
                  </button>
                </div>
              )}

              {/* Event Logs */}
              {interactiveLog && (
                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-50/70 animate-in slide-in-from-bottom duration-300">
                  <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest block mb-0.5">Terminal Event Log</p>
                  <p className="text-[10px] font-bold text-gray-700 font-mono tracking-tight leading-relaxed">{interactiveLog}</p>
                </div>
              )}
            </div>
          </div>

          {/* Interactive HUD */}
          <div className="lg:col-span-7 bg-white rounded-[32px] border border-gray-100 shadow-sm p-8 leading-relaxed">
            {scannedItem ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <h3 className="font-brand font-black text-lg uppercase text-gray-900">{scannedItem.article}</h3>
                    <p className="text-gray-400 font-mono text-[10px] mt-0.5">{scannedItem.propertyNumber} &bull; {scannedItem.office}</p>
                  </div>
                  <span className={`px-3 py-1 text-[9px] font-black uppercase rounded-full ${
                    scannedItem.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-850' :
                    scannedItem.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                    scannedItem.status === 'UNDER_REPAIR' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {scannedItem.status || 'AVAILABLE'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Assigned Custodian</span>
                    <span className="text-xs font-black text-gray-800 uppercase">{scannedItem.personAccountable || 'None'}</span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Target End User</span>
                    <span className="text-xs font-black text-gray-800 uppercase">{scannedItem.assignedStaff || 'Unassigned'}</span>
                  </div>
                </div>

                <div className="space-y-4 border-t pt-4">
                  <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Adjust Asset Assignment State</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Asset Status</label>
                      <select
                        value={newStatus}
                        onChange={e => setNewStatus(e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-xs font-bold"
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="ASSIGNED">ASSIGNED</option>
                        <option value="UNDER_REPAIR">UNDER REPAIR</option>
                        <option value="LOST">LOST</option>
                        <option value="CONDEMNED">CONDEMNED</option>
                        <option value="RETIRED">RETIRED</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Staff / User</label>
                      <input
                        type="text"
                        value={newStaff}
                        onChange={e => setNewStaff(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 rounded-lg text-xs font-bold border border-transparent focus:border-blue-500"
                        placeholder="End User Name"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Accountable Officer</label>
                      <input
                        type="text"
                        value={newAccountable}
                        onChange={e => setNewAccountable(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 rounded-lg text-xs font-bold border border-transparent focus:border-blue-500"
                        placeholder="Officer Name"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      onClick={handleSaveScannerUpdates}
                      className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all"
                    >
                      Submit Asset Assignment and Slips
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-20 text-gray-300">
                <svg className="w-16 h-16 opacity-30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v1l-2 2" /></svg>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] max-w-xs text-center leading-relaxed">
                  Terminal standby. Scan or select an active property tag on the left to verify registry records.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-8 max-w-xl mx-auto text-center space-y-6">
          <div className="p-4 bg-emerald-50 rounded-2xl w-16 h-16 flex items-center justify-center border border-emerald-100 text-emerald-600 font-brand text-2xl font-black mx-auto">
            ✓
          </div>
          <div className="space-y-2">
            <h3 className="font-brand font-black text-xl uppercase tracking-tight text-gray-900">QR Sticker Diagnostics</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-loose">
              Legacy assets uploaded without active system status properties or assigned staff can be updated instantly.
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-dashed flex justify-between items-center text-[11px]">
            <span className="font-bold text-gray-500 uppercase">Legacy items needing update:</span>
            <span className="font-black text-blue-600">{itemsNeedingBackfill.length} assets</span>
          </div>

          <button
            onClick={handleBulkBackfill}
            disabled={itemsNeedingBackfill.length === 0}
            className="w-full py-4 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-xl disabled:bg-gray-200 disabled:text-gray-400"
          >
            Run Active Batch Backfill
          </button>
        </div>
      )}

      {showPrintPreview && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-6 no-print animate-in fade-in duration-300">
          <div className="bg-white rounded-[48px] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-10 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-gray-900 font-brand uppercase tracking-tight">Print Verification</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Authorized Official Property Sticker Layout</p>
              </div>
              <button onClick={() => setShowPrintPreview(false)} className="p-3 bg-gray-50 rounded-2xl transition-all">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-12 bg-gray-200/50 flex items-center justify-center">
              <div className="transform scale-90 md:scale-110 origin-center">
                <StickerContent isFullSize={true} />
              </div>
            </div>

            <div className="p-10 bg-white border-t border-gray-100 flex justify-center items-center">
              <button 
                onClick={() => { setShowPrintPreview(false); setTimeout(() => handlePrint(), 300); }} 
                className="w-full sm:w-auto px-16 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95"
              >
                Confirm System Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stickers;
