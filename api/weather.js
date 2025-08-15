// This is a serverless function for Vercel.
// It fetches weather data from multiple Home Assistant entities,
// calculates an average, and returns a clean JSON payload.

export default async function handler(request, response) {
  // --- CONFIGURATION ---
  // These should be set as Environment Variables in your Vercel project.
  const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL; // e.g., 'http://<your-pi-ip-address>:8123'
  const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN;

  // Define the entity IDs for your weather sensors in Home Assistant.
  // We've replaced the deprecated WeatherFlow (TWC) with OpenWeatherMap.
  const ENTITIES = {
    nws: {
      temp: 'sensor.nws_temperature',
      precip: 'sensor.nws_precipitation_probability',
    },
    accuweather: {
      temp: 'sensor.accuweather_temperature',
      precip: 'sensor.accuweather_precipitation_probability',
    },
    openweathermap: { // <-- UPDATED SECTION
      temp: 'sensor.openweathermap_temperature',
      precip: 'sensor.openweathermap_precipitation_probability',
    }
  };
  // --- END CONFIGURATION ---

  if (!HOME_ASSISTANT_URL || !HOME_ASSISTANT_TOKEN) {
    return response.status(500).json({ error: 'Server configuration missing.' });
  }

  const headers = {
    'Authorization': `Bearer ${HOME_ASSISTANT_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Helper function to fetch state of a single entity
  const getEntityState = async (entityId) => {
    try {
      const res = await fetch(`${HOME_ASSISTANT_URL}/api/states/${entityId}`, { headers });
      if (!res.ok) {
        console.error(`Error fetching ${entityId}: ${res.statusText}`);
        return null;
      }
      const data = await res.json();
      return parseFloat(data.state);
    } catch (error) {
      console.error(`Exception fetching ${entityId}:`, error);
      return null;
    }
  };

  // Fetch all weather data in parallel
  const [
    nwsTemp, nwsPrecip,
    accuweatherTemp, accuweatherPrecip,
    owmTemp, owmPrecip // <-- UPDATED
  ] = await Promise.all([
    getEntityState(ENTITIES.nws.temp),
    getEntityState(ENTITIES.nws.precip),
    getEntityState(ENTITIES.accuweather.temp),
    getEntityState(ENTITIES.accuweather.precip),
    getEntityState(ENTITIES.openweathermap.temp), // <-- UPDATED
    getEntityState(ENTITIES.openweathermap.precip), // <-- UPDATED
  ]);

  // --- DATA BLENDING LOGIC ---
  const temperatures = [nwsTemp, accuweatherTemp, owmTemp].filter(t => t !== null && !isNaN(t)); // <-- UPDATED
  const precipitations = [nwsPrecip, accuweatherPrecip, owmPrecip].filter(p => p !== null && !isNaN(p)); // <-- UPDATED

  const averageTemp = temperatures.length > 0
    ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length
    : null;

  const averagePrecip = precipitations.length > 0
    ? precipitations.reduce((a, b) => a + b, 0) / precipitations.length
    : null;

  // --- FINAL JSON PAYLOAD ---
  const payload = {
    blended: {
      temperature: averageTemp !== null ? Math.round(averageTemp) : 'N/A',
      precipitation: averagePrecip !== null ? Math.round(averagePrecip) : 'N/A',
    },
    sources: {
      nws: { temp: nwsTemp, precip: nwsPrecip },
      accuweather: { temp: accuweatherTemp, precip: accuweatherPrecip },
      openweathermap: { temp: owmTemp, precip: owmPrecip }, // <-- UPDATED
    },
    last_updated: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
  };

  // Return the data to the caller (which will be Home Assistant)
  response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // Cache for 5 minutes
  return response.status(200).json(payload);
}
