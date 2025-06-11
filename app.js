/********** Global Variables **********/
let addPointMode = false;
let nextFeatureId = 6;
let customPointsData = {
    type: "FeatureCollection",
    features: []
};

async function fetchPointData() {
    const dataUrl = 'https://raw.githubusercontent.com/SchroderHill/point_data_RFM/main/points_geojson.geojson';
    try {
        const response = await fetch(dataUrl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        nextFeatureId = Math.max(...data.features.map(f => f.properties.id)) + 1;
        return data;
    } catch (error) {
        console.error('Error fetching point data:', error);
        showToast('Error loading points data');
        return {
            type: "FeatureCollection",
            name: "points_geojson",
            crs: { 
                type: "name", 
                properties: { 
                    name: "urn:ogc:def:crs:OGC:1.3:CRS84" 
                } 
            },
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
        if (savedData) {
            customPointsData = JSON.parse(savedData);
        } else {
            customPointsData = await fetchPointData();
        }
    } catch (error) {
        console.error('Error initializing data:', error);
        showToast('Error loading point data');
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
                0.3,
                1
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
  
    customPointsData.features.forEach(feature => {
        map.setFeatureState({ source: 'custom-points', id: feature.properties.id }, {
            archived: feature.properties.archived || false,
            watched: feature.properties.watched || false,
            remediated: feature.properties.remediated || false,
            pulse: 6,
            notes: feature.properties.notes || ""
        });
    });
  
    /********** Enable Adding New Points **********/
    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['points-layer'] });
        if (addPointMode && features.length === 0) {
            const newFeature = {
                type: 'Feature',
                id: nextFeatureId,
                properties: { id: nextFeatureId, priority: 'custom' },
                geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] }
            };
            customPointsData.features.push(newFeature);
            map.getSource('custom-points').setData(customPointsData);
            nextFeatureId++;
            addPointMode = false;
            document.getElementById('btn-add').innerHTML = `
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#f9f9f9" d="M19,13H5V11H19V13Z" />
              </svg>
            `;
            showToast("New point added. Click the point to set Watch/Archive/Remediated.");
        }
    });
  
    /********** Interactivity for Existing Points **********/
    map.on('click', 'points-layer', (e) => {
        // If in Add Point Mode, ignore clicks on existing points
        if (addPointMode) return;
  
        const feature = e.features[0];
        const id = feature.properties.id;
        const priority = feature.properties.priority;
        const coordinates = feature.geometry.coordinates.slice();
  
        // Retrieve current feature state for pre-population
        const featureState = map.getFeatureState({ source: 'custom-points', id: id });
        const isWatched = featureState.watched || false;
        const isArchived = featureState.archived || false;
        const isRemediated = featureState.remediated || false;
        const notesValue = featureState.notes || '';
  
        // Build the popup content without a delete button
        const popupContent = document.createElement('div');
        popupContent.innerHTML = `
          <h3>Point ID: ${id}</h3>
          <p>Priority: ${priority}</p>
          <form>
            <input type="radio" id="watch-${id}" name="action-${id}" value="watch" ${isWatched ? 'checked' : ''}>
            <label for="watch-${id}">Watch</label>
            <br>
            <input type="radio" id="archive-${id}" name="action-${id}" value="archive" ${isArchived ? 'checked' : ''}>
            <label for="archive-${id}">Archive</label>
            <br>
            <input type="radio" id="remediated-${id}" name="action-${id}" value="remediated" ${isRemediated ? 'checked' : ''}>
            <label for="remediated-${id}">Remediated</label>
            <br>
            <label for="notes-${id}">Notes:</label>
            <br>
            <textarea id="notes-${id}" rows="3" cols="30">${notesValue}</textarea>
            <br>
            <button type="button" id="submitBtn-${id}">Submit</button>
          </form>
        `;
  
        // Create and add the popup to the map
        const popup = new mapboxgl.Popup()
          .setLngLat(coordinates)
          .setDOMContent(popupContent)
          .addTo(map);
  
        // Handle Submit
        const submitButton = popupContent.querySelector(`#submitBtn-${id}`);
        submitButton.addEventListener('click', () => {
          const selectedRadio = popupContent.querySelector(`input[name="action-${id}"]:checked`);
          if (!selectedRadio) {
            showToast("Please select an action (Watch, Archive, or Remediated) before submitting.");
            return;
          }
          const action = selectedRadio.value;
          const notes = popupContent.querySelector(`#notes-${id}`).value;
  
          if (action === "archive") {
            map.setFeatureState(
              { source: 'custom-points', id: id },
              { archived: true, watched: false, remediated: false, pulse: 6, notes: notes }
            );
          } else if (action === "watch") {
            map.setFeatureState(
              { source: 'custom-points', id: id },
              { archived: false, watched: true, remediated: false, pulse: 6, notes: notes }
            );
            let startTime = performance.now();
            function animatePulse(timestamp) {
              let elapsed = timestamp - startTime;
              let pulse = 6 + 2 * Math.abs(Math.sin(elapsed / 200));
              map.setFeatureState({ source: 'custom-points', id: id }, { pulse: pulse });
              if (elapsed < 2000) {
                requestAnimationFrame(animatePulse);
              } else {
                map.setFeatureState({ source: 'custom-points', id: id }, { pulse: 6 });
              }
            }
            requestAnimationFrame(animatePulse);
          } else if (action === "remediated") {
            map.setFeatureState(
              { source: 'custom-points', id: id },
              { archived: false, watched: false, remediated: true, pulse: 6, notes: notes }
            );
          } 
          popupContent.classList.add('fade-out');
          setTimeout(() => {
            popup.remove();
          }, 500);
          showToast("Point updated");
        });
    });
  
    /********** Tooltip Functionality for Hovering Points **********/
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.padding = '5px 10px';
    tooltip.style.background = 'rgba(0, 0, 0, 0.7)';
    tooltip.style.color = '#fff';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '12px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '10000';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  
    map.on('mouseenter', 'points-layer', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features[0];
      const state = map.getFeatureState({ source: 'custom-points', id: feature.properties.id });
      let statusText = 'Status: ';
      if (state.archived) {
        statusText += 'Archived';
      } else if (state.watched) {
        statusText += 'Watched';
      } else if (state.remediated) {
        statusText += 'Remediated';
      } else {
        statusText += 'None';
      }
      tooltip.innerHTML = statusText;
      tooltip.style.display = 'block';
    });
  
    map.on('mousemove', 'points-layer', (e) => {
      tooltip.style.left = e.originalEvent.clientX + 10 + 'px';
      tooltip.style.top = e.originalEvent.clientY + 10 + 'px';
    });
  
    map.on('mouseleave', 'points-layer', () => {
      map.getCanvas().style.cursor = '';
      tooltip.style.display = 'none';
    });
});

/********** Dashboard Button Event Listener **********/
document.getElementById('btn-dashboard').addEventListener('click', () => {
  window.open('rainfullniwa_data.html', '_blank');
});
