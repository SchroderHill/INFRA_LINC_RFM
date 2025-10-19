/********** Global Variables **********/
let addPointMode = false;
let nextFeatureId = 6;
let customPointsData = {
    type: "FeatureCollection",
    features: []
};
let lastFetchTime = 0;
const FETCH_COOLDOWN = 300000; // 5 minutes in milliseconds
const DISPLACEMENT_SERIES = {
  high: {
    labels: ['2025-Jan', '2025-Feb', '2025-Mar', '2025-Apr', '2025-May', '2025-Jul', '2025-Sep'],
    data: [1.8, 0.2, -2.4, -3.9, -5.1, -6.2, -7.5]
  },
  medium: {
    labels: ['2025-Jan', '2025-Feb', '2025-Mar', '2025-Apr', '2025-May', '2025-Jul', '2025-Sep'],
    data: [1.2, 0.4, -0.9, -2.2, -3.1, -3.8, -4.5]
  },
  low: {
    labels: ['2025-Jan', '2025-Feb', '2025-Mar', '2025-Apr', '2025-May', '2025-Jul', '2025-Sep'],
    data: [0.9, 0.6, 0.1, -0.2, -0.4, -0.7, -0.9]
  },
  custom: {
    labels: ['2025-Jan', '2025-Feb', '2025-Mar', '2025-Apr', '2025-May', '2025-Jul', '2025-Sep'],
    data: [1.0, -0.1, -1.3, -2.1, -3.2, -3.9, -4.8]
  },
  default: {
    labels: ['2025-Jan', '2025-Feb', '2025-Mar', '2025-Apr', '2025-May', '2025-Jul', '2025-Sep'],
    data: [1.4, 0.3, -1.4, -2.6, -3.7, -4.3, -5.2]
  }
};

function getDisplacementSeries(priority, pointId) {
  const baseline = DISPLACEMENT_SERIES[priority] || DISPLACEMENT_SERIES.default;
  const seed = Number(pointId);

  return {
    labels: baseline.labels,
    data: baseline.data.map((value, index) => {
      // Create a pseudo-random but deterministic variation for each data point.
      // This makes each point's graph unique but stable.
      const randomizer = Math.sin(seed * 100 + index) * 10000;
      const variation = (randomizer - Math.floor(randomizer) - 0.5) * 1.5; // Varies between -0.75 and 0.75
      
      const newValue = value + variation;
      return Number(newValue.toFixed(2));
    })
  };
}

function destroyDisplacementChart(canvas) {
  if (canvas && canvas._displacementChart) {
    canvas._displacementChart.destroy();
    delete canvas._displacementChart;
  }
}

function renderDisplacementChart(canvas, priority, pointId) {
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  destroyDisplacementChart(canvas);
  const series = getDisplacementSeries(priority, pointId);

  const displacementChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Displacement (cm)',
          data: series.data,
          borderColor: '#ac0d60',
          backgroundColor: 'rgba(172, 13, 96, 0.15)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#ac0d60',
          pointBorderColor: '#ac0d60',
          tension: 0.35,
          fill: 'origin'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1200,
        easing: 'easeInOutQuart'
      },
      animations: {
        x: {
          type: 'number',
          duration: 700,
          easing: 'easeOutQuart',
          from: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.chart.scales.x.min ?? 0 : undefined),
          delay: (ctx) => (ctx.type === 'data' ? ctx.dataIndex * 120 : 0)
        },
        y: {
          type: 'number',
          duration: 700,
          easing: 'easeOutQuart',
          from: (ctx) => {
            if (ctx.type === 'data' && ctx.mode === 'default') {
              return ctx.chart.scales.y.min ?? 0;
            }
            return undefined;
          },
          delay: (ctx) => (ctx.type === 'data' ? ctx.dataIndex * 120 : 0)
        }
      },
      plugins: {
        legend: {
          labels: {
            color: '#f2f2f2'
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#d8d8d8', maxRotation: 45, minRotation: 45 },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        y: {
          ticks: { color: '#d8d8d8' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' }
        }
      }
    }
  });
}

async function fetchPointData(forceRefresh = false) {
    const dataUrl = 'https://schroderhill.github.io/point_data_RFM/points_geojson.geojson';
    try {
        const response = await fetch(dataUrl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        // Ensure each feature has the required properties *and* a root-level id
data.features = data.features.map(feature => {
  const rootId = feature.id ?? feature.properties.id ?? nextFeatureId++;
  return {
    ...feature,
    id: rootId,                         //  ← NEW  (root-level)
    properties: {
      ...feature.properties,
      id: rootId,                       //  (keep a copy in properties—handy for pop-ups)
      archived: false,
      watched: false,
      remediated: false,
      notes: ""
    }
  };
});
    

        nextFeatureId = Math.max(...data.features.map(f => f.properties.id)) + 1;
        lastFetchTime = Date.now();
        localStorage.setItem('lastFetchTime', lastFetchTime.toString());
        
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

    if (!customPointsData?.features?.length) {
      customPointsData = await fetchPointData(true);
    }

        // Populate forest filter dropdown
        populateForestFilter(customPointsData.features);

        map.addSource('custom-points', {
            type: 'geojson',
      data: customPointsData,
      promoteId: 'id'
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

/********** Forest Filter Dropdown **********/
function populateForestFilter(features) {
    const forestCounts = features.reduce((acc, feature) => {
        const forest = feature.properties.forest;
        if (forest) {
            acc[forest] = (acc[forest] || 0) + 1;
        }
        return acc;
    }, {});

    const select = document.getElementById('forest-select');
    // Clear existing options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }

    for (const forest in forestCounts) {
        const option = document.createElement('option');
        option.value = forest;
        option.textContent = `${forest} (${forestCounts[forest]})`;
        select.appendChild(option);
    }
}

document.getElementById('forest-select').addEventListener('change', function() {
    const selectedForest = this.value;

    // Determine which features to include
    const featuresToBound = (selectedForest === 'all')
        ? customPointsData.features
        : customPointsData.features.filter(feature => feature.properties.forest === selectedForest);

    if (featuresToBound.length === 0) {
        showToast("No points available for this selection.");
        // Fly to regional view if no points are found for a specific forest
        map.flyTo({ center: [173.942053519644503, -41.399980118741027], zoom: 4, duration: 2000 });
        return;
    }

    // Create a bounds object to include all relevant points
    const bounds = new mapboxgl.LngLatBounds();
    featuresToBound.forEach(feature => {
        bounds.extend(feature.geometry.coordinates);
    });

    // Animate the map to fit the bounds
    map.fitBounds(bounds, { padding: 100, duration: 2000, maxZoom: 15 });
});


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
        
        // First remove existing source and layer
        if (map.getLayer('points-layer')) {
            map.removeLayer('points-layer');
        }
    if (map.getSource('custom-points')) {
      map.removeSource('custom-points');
    }
        
        // Add source and layer again
    map.addSource('custom-points', {
      type: 'geojson',
      data: customPointsData,
      promoteId: 'id' // Ensure 'id' is promoted for feature states
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

        // Set feature states after layer is added
        customPointsData.features.forEach(feature => {
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

        showToast('Points refreshed from GitHub');
    } catch (error) {
        console.error('Error refreshing points:', error);
        showToast('Error refreshing points');
    }
});

// Add after the map initialization but before the map.on('load') event
map.on('click', 'points-layer', (e) => {
    if (addPointMode) return; // Don't show popup in add point mode
    
    const coordinates = e.features[0].geometry.coordinates.slice();
    const id = e.features[0].properties.id;
    const priority = e.features[0].properties.priority;
    const state = map.getFeatureState({ source: 'custom-points', id: id });
    
    // Create popup content with toggle buttons and notes
    const popupContent = document.createElement('div');
    popupContent.className = 'popup-content';
    popupContent.innerHTML = `
        <h4>Point ${id} (${priority})</h4>
        <div class="toggle-buttons">
            <button class="${state.watched ? 'active' : ''}" data-action="watch">
                Watch
            </button>
            <button class="${state.archived ? 'active' : ''}" data-action="archive">
                Archive
            </button>
            <button class="${state.remediated ? 'active' : ''}" data-action="remediate">
                Remediated
            </button>
        </div>
        <textarea placeholder="Add notes..." rows="3">${state.notes || ''}</textarea>
    <div class="graph-section">
      <button class="graph-toggle-btn">Show Displacement Graph</button>
      <div class="graph-wrapper">
        <canvas></canvas>
      </div>
    </div>
        <button class="submit-btn">Submit</button>
    `;

  const graphToggleBtn = popupContent.querySelector('.graph-toggle-btn');
  const graphWrapper = popupContent.querySelector('.graph-wrapper');
  const graphCanvas = graphWrapper.querySelector('canvas');

  const closeGraph = () => {
    graphToggleBtn.textContent = 'Show Displacement Graph';
    graphWrapper.classList.remove('open');
    destroyDisplacementChart(graphCanvas);
    graphWrapper.addEventListener('transitionend', () => {
      graphWrapper.style.display = 'none';
    }, { once: true });
  };

  const openGraph = () => {
    graphWrapper.style.display = 'block';
    requestAnimationFrame(() => {
      graphWrapper.classList.add('open');
      graphToggleBtn.textContent = 'Hide Displacement Graph';
      requestAnimationFrame(() => {
        const width = graphWrapper.clientWidth > 0 ? graphWrapper.clientWidth - 4 : 260;
        graphCanvas.width = width;
        graphCanvas.height = 220;
        try {
          renderDisplacementChart(graphCanvas, priority, id);
          graphCanvas._displacementChart?.resize();
        } catch (error) {
          console.error('Displacement chart error:', error);
          closeGraph();
          showToast('Unable to render displacement graph');
        }
      });
    });
  };

  graphToggleBtn.addEventListener('click', () => {
    const isOpen = graphWrapper.classList.contains('open');
    if (isOpen) {
      closeGraph();
    } else {
      openGraph();
    }
  });

    // Event listeners for toggle buttons
    const buttons = popupContent.querySelectorAll('.toggle-buttons button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            button.classList.toggle('active');
            
            // Update other buttons based on selection
            if (button.classList.contains('active')) {
                buttons.forEach(btn => {
                    if (btn !== button) btn.classList.remove('active');
                });
            }
        });
    });

    // Submit button event listener
    const submitBtn = popupContent.querySelector('.submit-btn');
    submitBtn.addEventListener('click', () => {
        const notes = popupContent.querySelector('textarea').value;
        const watchBtn = popupContent.querySelector('[data-action="watch"]');
        const archiveBtn = popupContent.querySelector('[data-action="archive"]');
        const remediateBtn = popupContent.querySelector('[data-action="remediate"]');

        // Update feature state
        map.setFeatureState(
            { source: 'custom-points', id: id },
            {
                watched: watchBtn.classList.contains('active'),
                archived: archiveBtn.classList.contains('active'),
                remediated: remediateBtn.classList.contains('active'),
                notes: notes,
                pulse: 6
            }
        );

        // Close popup with fade effect
        popupContent.classList.add('fade-out');
        setTimeout(() => popup.remove(), 500);
    });

    // Create and display popup
    const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '300px'
    })
    .setLngLat(coordinates)
    .setDOMContent(popupContent)
    .addTo(map);

  popup.on('close', () => {
    destroyDisplacementChart(graphCanvas);
    graphWrapper.classList.remove('open');
    graphWrapper.style.display = 'none';
    graphToggleBtn.textContent = 'Show Displacement Graph';
  });
});

// Add hover effect on points
map.on('mouseenter', 'points-layer', () => {
    map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'points-layer', () => {
    map.getCanvas().style.cursor = '';
});// ADD THIS *after* the 'points-layer' is added, but before your popup code
map.on('click', (e) => {
  if (!addPointMode) return;            // Only fire in add-point mode
  const coords = [e.lngLat.lng, e.lngLat.lat];

  // Build a new feature skeleton
  const newId = nextFeatureId++;
  const newFeature = {
    type: 'Feature',
    id: newId,                          // promoteId relies on this
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      id: newId,
      priority: 'custom',               // or ask the user later
      archived: false,
      watched: false,
      remediated: false,
      notes: ''
    }
  };

  // Push to in-memory store and refresh the source
  customPointsData.features.push(newFeature);
  map.getSource('custom-points').setData(customPointsData);

  // Set default feature-state (for stroke colours etc.)
  map.setFeatureState(
    { source: 'custom-points', id: newId },
    { archived: false, watched: false, remediated: false, pulse: 6, notes: '' }
  );

  // Optional: switch back to normal mode and reset icon
  addPointMode = false;
  document.getElementById('btn-add').innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#f9f9f9" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
    </svg>`;
  showToast(`Point ${newId} added`);
});

function showDisplacementGraph(pointData) {
  const modal = document.getElementById('displacement-modal');
  const chartContainer = document.getElementById('displacement-chart-container');
  
  // Clear previous chart if it exists
  if (displacementChart) {
    displacementChart.destroy();
  }

  // Create some sample displacement data
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  
  // Add slight random variation to each point's graph
  const baseDisplacement = Array.from({length: 10}, (_, i) => (i + 1) * 0.8);
  const displacementData = baseDisplacement.map(d => {
    const variation = (Math.random() - 0.5) * 2; // -1 to 1
    let value = d + variation;
    return Math.min(value, 12); // Cap at 12cm
  });

  // Flatten the curve for some points
  if (Math.random() < 0.2) { // 20% chance to flatten
    const lastValue = displacementData[displacementData.length - 2];
    displacementData[displacementData.length - 1] = lastValue + (Math.random() - 0.5) * 0.2;
  }

  const ctx = document.getElementById('displacement-chart').getContext('2d');
  displacementChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Displacement (cm)',
        data: displacementData,
        borderColor: '#007bff',
        backgroundColor: 'rgba(0, 123, 255, 0.5)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Displacement (cm)',
            color: 'white'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: 'white'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Time',
            color: 'white'
          },
          grid: {
            color: '#007bff' // Match line color
          },
          ticks: {
            color: 'white'
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: '#f2f2f2'
          }
        }
      },
      animation: {
        duration: 1200,
        easing: 'easeInOutQuart'
      }
    }
  });

  modal.style.display = 'block';
  // Close the modal when clicking outside of it
  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
      destroyDisplacementChart(ctx.canvas);
    }
  };
}

// Get the modal
var modal = document.getElementById("displacement-modal");

// Get the <span> element that closes the modal
var span = document.getElementsByClassName("close")[0];

// When the user clicks on <span> (x), close the modal
span.onclick = function() {
  modal.style.display = "none";
}

// When the user presses a key, close the modal if it's open
window.onkeydown = function(event) {
  if (event.key === "Escape" && modal.style.display === "block") {
    modal.style.display = "none";
    const ctx = document.getElementById('displacement-chart').getContext('2d');
    destroyDisplacementChart(ctx.canvas);
  }
};

