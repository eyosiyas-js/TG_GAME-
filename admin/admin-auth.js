/**
 * Admin Authorization Helper
 * Handles API key storage and adds the required header to all admin requests.
 */

const API_KEY_STORAGE_KEY = 'admin_api_key';
const BACKEND_URL = 'http://localhost:3005/admin/api/';

function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
}

function setApiKey(key) {
    if (key) {
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
    }
}

function clearApiKey() {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    window.location.reload();
}

/**
 * Enhanced fetch that automatically adds the admin API key header.
 */
async function fetchAdmin(endpoint, options = {}) {
    const key = getApiKey();
    
    // Default headers
    const headers = {
        'x-admin-api-key': key || '',
        ...options.headers
    };

    // Ensure no double slashes when joining
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const url = `${BACKEND_URL}${cleanEndpoint}`;

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401) {
        const errorData = await response.json();
        if (errorData.message === 'Invalid API key') {
            const newKey = prompt('Invalid or Missing Admin API Key. Please enter a valid key:');
            if (newKey) {
                setApiKey(newKey);
                // Retry the request
                return fetchAdmin(endpoint, options);
            }
        }
    }

    return response;
}

// Global guard: If a request fails with 401 on load, it will trigger the prompt
window.addEventListener('load', () => {
    if (!getApiKey()) {
        const key = prompt('Admin API Key required to access this dashboard:');
        if (key) {
            setApiKey(key);
            window.location.reload();
        }
    }
});
