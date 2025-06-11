/********** Global Variables **********/
let addPointMode = false;
let nextFeatureId = 6;
let customPointsData = {
    type: "FeatureCollection",
    features: []
};
let lastFetchTime = 0;
const FETCH_COOLDOWN = 300000; // 5 minutes in milliseconds

async function fetchPointData(forceRefresh = false) {
    const dataUrl = 'https://schroderhill.github.io/point_data_RFM/points_geojson.geojson';
    try {
        const response = await fetch(dataUrl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        nextFeatureId = Math.max(...data.features.map(f => f.properties.id)) + 1;
        
        // Store fetch timestamp
        lastFetchTime = Date.now();
        localStorage.setItem('lastFetchTime', lastFetchTime.toString());
        
        // Store the original data separately
        localStorage.setItem('originalPointsData', JSON.stringify(data));
        
        return data;
    } catch (error) {
        console.error('Error fetching point data:', error);
        showToast('Error loading points data');
        return {
            type: "FeatureCollection",
            features: []
        };
    }
}

/********** Toast Function **********/
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 400);
  }, 4000);
}

/********** Initialize Mapbox Map **********/
mapboxgl.accessToken = 'pk.eyJ1Ijoic2Nocm9kZXItaGlsbCIsImEiOiJjbHpmdW5ibXUxY3I1MmtvbXU3c2t0aHhoIn0.D_W59ZKzQSJf7WF8Cfhm3w';
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/satellite-v9',
  projection: 'globe',
  zoom: 4,
  center: [173.942053519644503, -41.399980118741027]
});

map.on('style.load', () => {
  map.setFog({});
});

/********** Rotation Configuration **********/
const secondsPerRevolution = 1820;
const maxSpinZoom = 1;
const slowSpinZoom = 0;
let userInteracting = false;
let spinEnabled = true;

function spinGlobe() {
  const zoom = map.getZoom();
  if (spinEnabled && !userInteracting && zoom < maxSpinZoom) {
    let distancePerSecond = 360 / secondsPerRevolution;
    if (zoom > slowSpinZoom) {
      const zoomDif = (maxSpinZoom - zoom) / (maxSpinZoom - slowSpinZoom);
      distancePerSecond *= zoomDif;
    }
    const center = map.getCenter();
    center.lng -= distancePerSecond;
    map.easeTo({ center, duration: 1000, easing: (n) => n });
  }
}

// Pause spinning on interaction
map.on('mousedown', () => { userInteracting = true; });
map.on('mouseup', () => { userInteracting = false; spinGlobe(); });
map.on('dragend', () => { userInteracting = false; spinGlobe(); });
map.on('pitchend', () => { userInteracting = false; spinGlobe(); });
map.on('rotateend', () => { userInteracting = false; spinGlobe(); });
map.on('moveend', () => { spinGlobe(); });

/********** Save Session Button **********/
document.getElementById('btn-save').addEventListener('click', () => {
  // For each feature, update its properties with the current feature state
  customPointsData.features.forEach(feature => {
    const state = map.getFeatureState({ source: 'custom-points', id: feature.properties.id });
    feature.properties.archived = state.archived || false;
    feature.properties.watched = state.watched || false;
    feature.properties.remediated = state.remediated || false;
    feature.properties.notes = state.notes || "";
  });
  // Save the updated GeoJSON to localStorage
  localStorage.setItem('customPointsData', JSON.stringify(customPointsData));
  showToast("Session saved");
});

/********** Fly To Button Functionality **********/
document.getElementById('btn-flyto').addEventListener('click', () => {
  if (!customPointsData.features.length) {
    showToast("No points available");
    return;
  }
  // Create a bounds object to include all points
  let bounds = new mapboxgl.LngLatBounds();
  customPointsData.features.forEach(feature => {
    bounds.extend(feature.geometry.coordinates);
  });
  // Animate the map to fit the bounds with a padding of 50 pixels and 2000ms duration
  map.fitBounds(bounds, { padding: 50, duration: 2000 });
});

/********** Regional View Button Functionality **********/
document.getElementById('btn-regional').addEventListener('click', () => {
  // Fly back to a regional view using zoom level 4 and the original center
  map.flyTo({ center: [173.942053519644503, -41.399980118741027], zoom: 4, duration: 7000 });
  showToast("Regional view activated");
});

/********** Add Point Button (Toggle) **********/
document.getElementById('btn-add').addEventListener('click', () => {
  const btnAdd = document.getElementById('btn-add');
  if (!addPointMode) {
    addPointMode = true;
    showToast("Add mode enabled. Click on the map to add a point.");
    // Change icon to a "cancel" icon (a minus sign)
    btnAdd.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path fill="#f9f9f9" d="M19,13H5V11H19V13Z" />
      </svg>
    `;
  } else {
    addPointMode = false;
    showToast("Add mode disabled.");
    // Revert icon back to plus sign
    btnAdd.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path fill="#f9f9f9" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
      </svg>
    `;
  }
});

/********** Export CSV Button and Functionality **********/
const exportButton = document.createElement('button');
exportButton.id = 'btn-export';
exportButton.className = 'small-button';
exportButton.title = 'Export CSV';
exportButton.innerHTML = `
  <svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#f9f9f9" d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v4h4.66v-4h3.84L12 2z"/>
  </svg>
`;
document.querySelector('.top-right-buttons').appendChild(exportButton);

function exportToCSV() {
  // Updated header includes a Date column
  let csvContent = 'Point ID,Status,Longitude,Latitude,Notes,Date\n';
  
  customPointsData.features.forEach(feature => {
    const id = feature.properties.id;
    const coords = feature.geometry.coordinates;
    // Retrieve dynamic state for each feature
    const state = map.getFeatureState({ source: 'custom-points', id: id });
    let status = 'None';
    if (state.archived) {
      status = 'Archived';
    } else if (state.watched) {
      status = 'Watched';
    } else if (state.remediated) {
      status = 'Remediated';
    }
    const notes = state.notes || '';
    // Get the current date in ISO format
    const now = new Date().toISOString();
    // Build CSV row with separate Longitude, Latitude, and Date columns
    csvContent += `${id},"${status}",${coords[0]},${coords[1]},"${notes}","${now}"\n`;
  });
  
  // Create a Blob and trigger a download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'points_export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

exportButton.addEventListener('click', exportToCSV);

/********** Reset Points Button and Functionality **********/
// Create a Reset Points button
const resetButton = document.createElement('button');
resetButton.id = 'btn-reset';
resetButton.className = 'small-button';
resetButton.title = 'Reset Points';
resetButton.innerHTML = `
  <svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#f9f9f9" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
  </svg>
`;
document.querySelector('.top-right-buttons').appendChild(resetButton);

// Reset feature states for all points when the button is clicked
resetButton.addEventListener('click', () => {
  customPointsData.features.forEach(feature => {
    const id = feature.properties.id;
    map.setFeatureState(
      { source: 'custom-points', id: id },
      { archived: false, watched: false, remediated: false, pulse: 6, notes: "" }
    );
  });
  showToast("All points reset to default");
});

/********** Mark All Dropdown Functionality **********/
// Listen for changes on the "Mark all" dropdown
document.getElementById('mark-all-select').addEventListener('change', function() {
  const status = this.value;
  if (!status) return; // if no valid selection, do nothing
  
  // Iterate over every feature and update its state
  customPointsData.features.forEach(feature => {
    const id = feature.properties.id;
    if (status === 'watch') {
      map.setFeatureState({ source: 'custom-points', id: id }, {
        archived: false,
        watched: true,
        remediated: false,
        pulse: 6,
        notes: ""
      });
    } else if (status === 'archive') {
      map.setFeatureState({ source: 'custom-points', id: id }, {
        archived: true,
        watched: false,
        remediated: false,
        pulse: 6,
        notes: ""
      });
    } else if (status === 'remediated') {
      map.setFeatureState({ source: 'custom-points', id: id }, {
        archived: false,
        watched: false,
        remediated: true,
        pulse: 6,
        notes: ""
      });
    }
  });
  
  showToast(`All points marked as ${status}`);
  // Reset the dropdown back to its default prompt
  this.value = "";
});

spinGlobe();

/********** Load GeoJSON Data & Add Layer **********/
map.on('load', async () => {
    try {
        const savedData = localStorage.getItem('customPointsData');
        const savedTime = parseInt(localStorage.getItem('lastFetchTime') || '0');
        const timeSinceLastFetch = Date.now() - savedTime;

        if (!savedData || timeSinceLastFetch > FETCH_COOLDOWN) {
            customPointsData = await fetchPointData();
        } else {
            customPointsData = JSON.parse(savedData);
        }

        map.addSource('custom-points', {
            type: 'geojson',
            data: customPointsData
        });
  
        map.addLayer({
            id: 'points-layer',
            type: 'circle',
            source: 'custom-points',
            paint: {
                'circle-radius': [
                    'case',
                    ['boolean', ['feature-state', 'watched'], false],
                    ['coalesce', ['feature-state', 'pulse'], 6],
                    6
                ],
                'circle-color': [
                    'match',
                    ['get', 'priority'],
                    'high', '#FF0000',
                    'medium', '#FFA500',
                    'low', '#008000',
                    'custom', '#00FFFF',
                    '#000000'
                ],
                'circle-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'archived'], false],
                    0.3,  // When archived, set opacity to 0.3
                    1     // Otherwise, full opacity
                ],
                'circle-stroke-color': [
                    'case',
                    ['boolean', ['feature-state', 'remediated'], false], '#00FF00',
                    ['boolean', ['feature-state', 'watched'], false], '#FFFFFF',
                    'transparent'
                ],
                'circle-stroke-width': [
                    'case',
                    ['boolean', ['feature-state', 'remediated'], false], 2,
                    ['boolean', ['feature-state', 'watched'], false], 2,
                    0
                ]
            }
        });
  
        // Set feature states for all points
        setFeatureStates(customPointsData.features);

    } catch (error) {
        console.error('Error initializing data:', error);
        showToast('Error loading point data');
    }
    
    // ...rest of your existing map.on('load') code...
});

// Add this helper function
function setFeatureStates(features) {
    features.forEach(feature => {
        map.setFeatureState(
            { source: 'custom-points', id: feature.properties.id },
            {
                archived: feature.properties.archived || false,
                watched: feature.properties.watched || false,
                remediated: feature.properties.remediated || false,
                pulse: 6,
                notes: feature.properties.notes || ""
            }
        );
    });
}

/********** Dashboard Button Event Listener **********/
document.getElementById('btn-dashboard').addEventListener('click', () => {
  window.open('rainfullniwa_data.html', '_blank');
});

// Add a force refresh button
const refreshButton = document.createElement('button');
refreshButton.id = 'btn-refresh';
refreshButton.className = 'small-button';
refreshButton.title = 'Force Refresh Points';
refreshButton.innerHTML = `
  <svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#f9f9f9" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>
`;
document.querySelector('.top-right-buttons').appendChild(refreshButton);

// Add refresh button event listener
refreshButton.addEventListener('click', async () => {
    try {
        // Force fetch new data
        customPointsData = await fetchPointData(true);
        // Update the map source
        map.getSource('custom-points').setData(customPointsData);
        // Set feature states for all points
        setFeatureStates(customPointsData.features);
        showToast('Points refreshed from GitHub');
    } catch (error) {
        console.error('Error refreshing points:', error);
        showToast('Error refreshing points');
    }
});
