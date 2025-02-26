// Constants
const MAX_LOCALSTORAGE_SIZE = 5 * 1024 * 1024; // 5MB approximate limit
const IMAGE_QUALITY = 0.7; // JPEG compression quality
const MAX_IMAGE_DIMENSION = 800; // Maximum width or height for images
const STORAGE_KEY = 'stockInventory';
const MAX_RETRIES = 3; // Maximum number of API call retries

// State
let inventory = [];
let storageAvailable = false;
let toastTimeout = null;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the app
    loadInventory();
    setupEventListeners();
    updateStorageInfo();
});

// Fetch with retry functionality
const fetchWithRetry = async (url, options = {}, maxRetries = MAX_RETRIES) => {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Attempt the fetch request
            const response = await fetch(url, options);
            
            // If response is not ok, throw an error
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            // Return the successful response
            return response;
        } catch (error) {
            console.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
            lastError = error;
            
            // Calculate exponential backoff delay: 2^attempt * 100ms
            const delay = Math.min(Math.pow(2, attempt) * 100, 2000);
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // If all retries failed, throw the last error
    throw new Error(`Failed after ${maxRetries} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
};

// Check if storage is available
const checkStorageAvailability = () => {
    try {
        const testKey = '__storage_test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (e) {
        return false;
    }
};

// Get storage usage information
const getStorageInfo = () => {
    if (!storageAvailable) return { used: 0, quota: 0, percentage: 0 };
    
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        used += (key.length + value.length) * 2; // UTF-16 characters are 2 bytes each
    }
    
    return {
        used,
        quota: MAX_LOCALSTORAGE_SIZE,
        percentage: (used / MAX_LOCALSTORAGE_SIZE) * 100
    };
};

// Update storage info display
const updateStorageInfo = () => {
    const storageInfo = document.getElementById('storage-info');
    const storageUsed = document.getElementById('storage-used');
    const storageQuota = document.getElementById('storage-quota');
    const storageBar = document.getElementById('storage-bar');
    
    if (!storageAvailable) {
        storageInfo.classList.add('hidden');
        return;
    }
    
    const info = getStorageInfo();
    
    // Format sizes for display
    const usedFormatted = info.used < 1024 ? 
        `${info.used} B` : 
        info.used < 1024 * 1024 ? 
            `${(info.used / 1024).toFixed(1)} KB` : 
            `${(info.used / (1024 * 1024)).toFixed(1)} MB`;
            
    const quotaFormatted = `${(info.quota / (1024 * 1024)).toFixed(0)} MB`;
    
    // Update display
    storageUsed.textContent = usedFormatted;
    storageQuota.textContent = quotaFormatted;
    storageBar.style.width = `${Math.min(info.percentage, 100)}%`;
    
    // Set bar color based on usage
    if (info.percentage > 90) {
        storageBar.classList.remove('bg-blue-800', 'bg-yellow-500');
        storageBar.classList.add('bg-red-600');
    } else if (info.percentage > 70) {
        storageBar.classList.remove('bg-blue-800', 'bg-red-600');
        storageBar.classList.add('bg-yellow-500');
    } else {
        storageBar.classList.remove('bg-yellow-500', 'bg-red-600');
        storageBar.classList.add('bg-blue-800');
    }
    
    // Show storage info
    storageInfo.classList.remove('hidden');
    
    // Show warning if close to limit
    if (info.percentage > 85) {
        showToast('Warning: Running low on storage space. Consider exporting and clearing data.', 'warning');
    }
};

// Load inventory from storage
const loadInventory = () => {
    storageAvailable = checkStorageAvailability();
    
    if (storageAvailable) {
        try {
            const storedInventory = localStorage.getItem(STORAGE_KEY);
            if (storedInventory) {
                inventory = JSON.parse(storedInventory);
            }
            showStorageStatus(true);
        } catch (error) {
            console.error('Error loading from storage:', error);
            showStorageStatus(false, 'Error loading data');
        }
    } else {
        showStorageStatus(false);
    }
    
    updateInventoryDisplay();
};

// Save inventory to storage
const saveInventory = () => {
    if (storageAvailable) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
            showStorageStatus(true, 'Data saved');
            updateStorageInfo();
        } catch (error) {
            console.error('Error saving to storage:', error);
            if (error.name === 'QuotaExceededError' || error.code === 22) {
                showStorageStatus(false, 'Storage quota exceeded');
                showToast('Storage quota exceeded. Try removing some items or images.', 'error');
            } else {
                showStorageStatus(false, 'Error saving data');
            }
        }
    }
};

// Cloud sync functionality (example implementation)
const syncWithCloud = async () => {
    try {
        showToast('Syncing with cloud...', 'info');
        
        // This would be replaced with your actual API endpoint
        const apiUrl = 'https://api.example.com/inventory/sync';
        
        // Call the API with retry functionality
        const response = await fetchWithRetry(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(inventory)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Cloud sync successful!', 'success');
        } else {
            throw new Error(data.message || 'Unknown error');
        }
    } catch (error) {
        console.error('Cloud sync failed:', error);
        showToast(`Cloud sync failed: ${error.message}`, 'error');
    }
};

// Show storage status to user
const showStorageStatus = (isAvailable, message = null) => {
    const storageStatus = document.getElementById('storage-status');
    
    if (isAvailable) {
        storageStatus.classList.remove('bg-yellow-100', 'text-yellow-800', 'bg-red-100', 'text-red-800');
        storageStatus.classList.add('bg-green-100', 'text-green-800');
        storageStatus.innerHTML = `
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            ${message || 'Data will be saved automatically'}
        `;
        
        // If it's a temporary message, revert to default message after 2 seconds
        if (message && message !== 'Data will be saved automatically') {
            setTimeout(() => {
                if (storageAvailable) {
                    showStorageStatus(true);
                }
            }, 2000);
        }
    } else {
        storageStatus.classList.remove('bg-green-100', 'text-green-800');
        storageStatus.classList.add('bg-yellow-100', 'text-yellow-800');
        storageStatus.innerHTML = `
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
            </svg>
            ${message || 'Storage unavailable - data will not be saved between sessions'}
        `;
        
        if (message && message.includes('quota')) {
            storageStatus.classList.remove('bg-yellow-100', 'text-yellow-800');
            storageStatus.classList.add('bg-red-100', 'text-red-800');
        }
    }
};

// Generate a unique ID
const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Set up event listeners
const setupEventListeners = () => {
    // Image preview
    const imageInput = document.getElementById('item-image');
    const previewContainer = document.getElementById('image-preview-container');
    const imageSizeWarning = document.getElementById('image-size-warning');
    
    imageInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            previewContainer.innerHTML = '<span>Preview</span>';
            previewContainer.classList.add('image-placeholder');
            imageSizeWarning.classList.add('hidden');
            return;
        }
        
        // Check file size
        if (file.size > 2 * 1024 * 1024) { // 2MB
            imageSizeWarning.classList.remove('hidden');
        } else {
            imageSizeWarning.classList.add('hidden');
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            previewContainer.classList.remove('image-placeholder');
            previewContainer.innerHTML = `<img src="${event.target.result}" class="image-preview" alt="Preview">`;
        };
        reader.readAsDataURL(file);
    });
    
    // Add new item
    const addItemForm = document.getElementById('add-item-form');
    
    addItemForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById('item-name');
        const quantityInput = document.getElementById('item-quantity');
        const imageInput = document.getElementById('item-image');
        
        const name = nameInput.value.trim();
        const quantity = parseInt(quantityInput.value, 10);
        
        if (!name || isNaN(quantity)) {
            return;
        }
        
        // Show loading state
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.classList.remove('hidden');
        
        // Process image
        processImage(imageInput.files[0]).then(imageData => {
            // Create new item
            const newItem = {
                id: generateId(),
                name,
                quantity,
                image: imageData,
                createdAt: new Date().toISOString()
            };
            
            // Add to inventory
            inventory.push(newItem);
            
            // Save to storage
            saveInventory();
            
            // Update display
            updateInventoryDisplay();
            
            // Reset form
            addItemForm.reset();
            previewContainer.innerHTML = '<span>Preview</span>';
            previewContainer.classList.add('image-placeholder');
            imageSizeWarning.classList.add('hidden');
            
            // Hide loading state
            loadingIndicator.classList.add('hidden');
            
            // Show success toast
            showToast('Item added successfully', 'success');
        }).catch(error => {
            console.error('Error processing image:', error);
            loadingIndicator.classList.add('hidden');
            showToast('Error adding item: ' + error.message, 'error');
        });
    });
    
    // Tool buttons
    const exportDataBtn = document.getElementById('export-data');
    const importDataBtn = document.getElementById('import-data');
    const importFileInput = document.getElementById('import-file');
    const clearDataBtn = document.getElementById('clear-data');
    const syncCloudBtn = document.getElementById('sync-cloud');
    
    exportDataBtn?.addEventListener('click', exportInventory);
    importDataBtn?.addEventListener('click', () => importFileInput.click());
    importFileInput?.addEventListener('change', importInventory);
    clearDataBtn?.addEventListener('click', () => {
        showConfirmModal(
            'Clear All Data',
            'Are you sure you want to delete all inventory data? This action cannot be undone.',
            clearInventory
        );
    });
    
    syncCloudBtn?.addEventListener('click', syncWithCloud);
};

// Process image - resize and compress for storage efficiency
const processImage = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve(null);
            return;
        }
        
        // Check if it's an image
        if (!file.type.startsWith('image/')) {
            reject(new Error('Please select a valid image file'));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Determine if resizing is needed
                let width = img.width;
                let height = img.height;
                
                if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
                    if (width > height) {
                        height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
                        width = MAX_IMAGE_DIMENSION;
                    } else {
                        width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
                        height = MAX_IMAGE_DIMENSION;
                    }
                }
                
                // Create canvas for resizing
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to JPEG for better compression
                const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
                
                // Check final size
                const approximateSize = Math.round((dataUrl.length * 3) / 4) - 
                                      (dataUrl.indexOf(',') + 1);
                                      
                if (approximateSize > 1024 * 1024) { // > 1MB
                    showToast('Image compressed but still large. Storage may be limited.', 'warning');
                }
                
                resolve(dataUrl);
            };
            
            img.onerror = () => {
                reject(new Error('Error loading image'));
            };
            
            img.src = event.target.result;
        };
        
        reader.onerror = () => {
            reject(new Error('Error reading file'));
        };
        
        reader.readAsDataURL(file);
    });
};

// Update item quantity
const updateItemQuantity = (id, change) => {
    const index = inventory.findIndex(item => item.id === id);
    if (index !== -1) {
        const newQuantity = Math.max(0, inventory[index].quantity + change);
        inventory[index].quantity = newQuantity;
        
        // Update display
        const quantityElement = document.querySelector(`#item-${id} .item-quantity`);
        if (quantityElement) {
            quantityElement.textContent = newQuantity;
            quantityElement.classList.add('quantity-changed');
            setTimeout(() => {
                quantityElement.classList.remove('quantity-changed');
            }, 300);
        }
        
        if (newQuantity === 0) {
            const itemElement = document.getElementById(`item-${id}`);
            if (itemElement) {
                itemElement.classList.add('bg-red-100', 'dark:bg-red-900', 'border-red-300');
            }
        }
        
        // Save changes to storage
        saveInventory();
    }
};

// Delete item
const deleteItem = (id) => {
    const index = inventory.findIndex(item => item.id === id);
    if (index !== -1) {
        inventory.splice(index, 1);
        // Save changes to storage
        saveInventory();
        updateInventoryDisplay();
        showToast('Item deleted', 'info');
    }
};

// Update inventory display
const updateInventoryDisplay = () => {
    const inventoryGrid = document.getElementById('inventory-grid');
    const noItemsMessage = document.getElementById('no-items-message');
    const itemCount = document.getElementById('item-count');
    
    if (!inventoryGrid || !noItemsMessage || !itemCount) return;
    
    // Update item count
    itemCount.textContent = `${inventory.length} item${inventory.length !== 1 ? 's' : ''}`;
    
    // Show/hide no items message
    if (inventory.length === 0) {
        noItemsMessage.classList.remove('hidden');
        inventoryGrid.innerHTML = '';
        return;
    } else {
        noItemsMessage.classList.add('hidden');
    }
    
    // Clear and rebuild inventory grid
    inventoryGrid.innerHTML = '';
    
    // Sort inventory (newest first)
    const sortedInventory = [...inventory].sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // Add items to grid
    sortedInventory.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.id = `item-${item.id}`;
        itemElement.className = 'item-card rounded-lg shadow-md overflow-hidden new-item';
        
        const imageHtml = item.image 
            ? `<img src="${item.image}" alt="${item.name}" class="w-full h-40 object-cover">`
            : `<div class="w-full h-40 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
              </div>`;
        
        itemElement.innerHTML = `
            ${imageHtml}
            <div class="p-4">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-lg font-semibold">${item.name}</h3>
                    <button class="delete-btn text-red-500 hover:text-red-700 transition" data-id="${item.id}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
                <div class="flex items-center justify-between mt-4">
                    <div class="flex items-center">
                        <button class="decrement-btn p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition" data-id="${item.id}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>
                            </svg>
                        </button>
                        <span class="item-quantity text-lg font-bold mx-3 min-w-[20px] text-center">${item.quantity}</span>
                        <button class="increment-btn p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition" data-id="${item.id}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        in stock
                    </div>
                </div>
            </div>
        `;
        
        inventoryGrid.appendChild(itemElement);
        
        // Remove new-item class after animation completes
        setTimeout(() => {
            itemElement.classList.remove('new-item');
        }, 300);
    });
    
    // Add event listeners for buttons
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            showConfirmModal(
                'Delete Item',
                'Are you sure you want to delete this item?',
                () => deleteItem(id)
            );
        });
    });
    
    document.querySelectorAll('.increment-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            updateItemQuantity(id, 1);
        });
    });
    
    document.querySelectorAll('.decrement-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            updateItemQuantity(id, -1);
        });
    });
};

// Show toast notification
const showToast = (message, type = 'info') => {
    // Remove existing toast if present
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Clear timeout if exists
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon based on type
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>';
            break;
        case 'error':
            icon = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
            break;
        case 'warning':
            icon = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>';
            break;
        default:
            icon = '<svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1v-3a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>';
    }
    
    toast.innerHTML = `
        ${icon}
        <span>${message}</span>
    `;
    
    // Add to DOM
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Remove after 3 seconds
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
};

// Show confirmation modal
const showConfirmModal = (title, message, onConfirm) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    overlay.innerHTML = `
        <div class="modal-content">
            <h3 class="text-xl font-semibold mb-2">${title}</h3>
            <p class="mb-6">${message}</p>
            <div class="flex justify-end space-x-3">
                <button id="modal-cancel" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition">
                    Cancel
                </button>
                <button id="modal-confirm" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition">
                    Confirm
                </button>
            </div>
        </div>
    `;
    
    // Add to DOM
    document.body.appendChild(overlay);
    
    // Trigger animation
    setTimeout(() => {
        overlay.classList.add('show');
    }, 10);
    
    // Set up event listeners
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');
    
    const closeModal = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    };
    
    cancelBtn.addEventListener('click', closeModal);
    
    confirmBtn.addEventListener('click', () => {
        closeModal();
        onConfirm();
    });
};

// Export inventory
const exportInventory = () => {
    if (inventory.length === 0) {
        showToast('No inventory data to export', 'warning');
        return;
    }
    
    try {
        const dataStr = JSON.stringify(inventory, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const exportFileName = `inventory_export_${new Date().toISOString().split('T')[0]}.json`;
        
        // Create link and trigger download
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileName);
        linkElement.style.display = 'none';
        
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
        
        showToast('Inventory exported successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error exporting inventory data', 'error');
    }
};

// Import inventory
const importInventory = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (!Array.isArray(importedData)) {
                throw new Error('Invalid inventory data format');
            }
            
            showConfirmModal(
                'Import Inventory',
                `This will add ${importedData.length} items to your inventory. Continue?`,
                () => {
                    // Add imported items
                    importedData.forEach(item => {
                        // Ensure each item has the required fields
                        if (!item.id) item.id = generateId();
                        if (!item.createdAt) item.createdAt = new Date().toISOString();
                        
                        // Add to inventory
                        inventory.push(item);
                    });
                    
                    // Save and update
                    saveInventory();
                    updateInventoryDisplay();
                    
                    showToast(`Imported ${importedData.length} items successfully`, 'success');
                }
            );
        } catch (error) {
            console.error('Import error:', error);
            showToast('Error importing inventory data: ' + error.message, 'error');
        }
    };
    
    reader.onerror = () => {
        showToast('Error reading file', 'error');
    };
    
    reader.readAsText(file);
    
    // Reset the file input so the same file can be selected again
    event.target.value = '';
};

// Clear inventory
const clearInventory = () => {
    inventory = [];
    saveInventory();
    updateInventoryDisplay();
    showToast('All inventory data cleared', 'info');
};