// this can be run once per day at most to get the latest list of locations. NAC not likely to add new locations every day. (at most every 3 months)

import cheerio from 'cheerio';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@googlemaps/google-maps-services-js';

const client = new Client({});

async function getLatLong(address) {
  try {
    const response = await client.geocode({
      params: {
        address: address,
        key: "AIzaSyASRC3EeCzmTCsE_WjkDcywpCgZzSA395A" , // Replace with your API key
      },
    });

    const location = response.data.results[0].geometry.location;
    console.log(`Latitude: ${location.lat}, Longitude: ${location.lng}`);
    return location;
  } catch (error) {
    console.error("Error fetching geolocation:", error);
  }
}


async function scrape_locations() {

    const supabase = createClient('https://mlbwzkspmgxhudfnsfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sYnd6a3NwbWd4aHVkZm5zZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY1NzA5NDIsImV4cCI6MjAzMjE0Njk0Mn0.j-2nIAYjiFGMPfaaVAm18SfZxUbY4g57kjbo_RjaBYg')

    const base_url = 'https://eservices.nac.gov.sg/Busking';
    // navigate to the busking page using axios
    const response = await axios.get(base_url);
    // get the html
    const html = response.data;
    // load the html into cheerio
    const $ = cheerio.load(html);
    // Get all the option elements inside location element
    const location = $('#Location');
    const options = location.find('option');
    const num_locations = options.length;

    // fetch locations from supabase
    const { data: locations_data, error: locations_error } = await supabase.from('locations').select('id');
    if (locations_error) {
        console.log("Error fetching locations");
    }
    const supabase_locations = locations_data.map(location => location.id);
    // compare with the location ids from the NAC website. if no difference, end the script
    const location_ids = options.map((index, element) => $(element).val()).get().filter(id => id !== "00000000-0000-0000-0000-000000000000");
    if (location_ids.every(id => supabase_locations.includes(id))) {
        console.log("No new locations found. Exiting script");
        return;
    }
    else{
        console.log("New locations found. Rescraping all locations");
    }


    let location_list = [];
    let counter = 1;
    for (const element of options.toArray()) {
        console.log("Scraping location #" + (location_list.length + 1) + "/" + num_locations);
        let location_name = $(element).text();
        let location_id = $(element).val();
        if (location_id === "00000000-0000-0000-0000-000000000000") {
            continue; // Skip invalid location
        }
        const location_url = `https://eservices.nac.gov.sg/Busking/locations/${location_id}/events`;
        // navigate to the location page using axios
        const response = await axios.get(location_url);
        // get the html
        const html = response.data;
        // load the html into cheerio
        const $2 = cheerio.load(html);
        // get the div with id = "div-header", 
        const location_header = $2('#div-header');
        // get the first child with ul then get the first li with "dash-bx-times" class
        const location_address = location_header.find('ul').first().find('li.dash-bx-times').first().text().trim();
        const location_description = location_header.find('p').first().text().trim();
        const location_area = location_header.find('span').first().text().trim();
        // TODO: get the lat long of the locations using google geocoding api
        const location_lat_long = await getLatLong(location_address);

        
        
        location_list.push({
            "id": location_id,
            "name": location_name,
            "address": location_address,
            "description": location_description,
            "area": location_area,
            "lat": location_lat_long.lat,
            "lng": location_lat_long.lng,
        });
        counter += 1;
    }

    console.log(location_list);
    console.log(location_list.length);
    // delete all locations from supabase
    const { data: delete_data, error: delete_error } = await supabase.from('locations').delete().gt('created_at', '2000-01-01');
    if (delete_error) {
        console.log("Error deleting locations");
        console.log(delete_error);
    }
    else {
        console.log("Locations deleted successfully");
        console.log(delete_data);
    }
    // save the locations to supabase
    const { data, error } = await supabase.from('locations').insert(location_list);
    if (error) {
        console.log("Error inserting locations");
        console.log(error);
    }
    else {
        console.log("Locations inserted successfully");
        console.log(data);
    }

}

scrape_locations();