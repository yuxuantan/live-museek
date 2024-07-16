const axios = require('axios');
const cheerio = require('cheerio');
import { supabase } from '../../supabaseClient';

export async function GET() {
    try {
        console.log('Scraping Eventbrite...');
        const resp = await scrapeEventBrite(); // await the completion of scrapeEventBrite
        // delete events with performerId = 'eventbrite' from supabase table
        const { data: deleteData, error: deleteError } = await supabase.from('events').delete().match({ performerIds: 'eventbrite' });
        if (deleteError) {
            console.error('Error deleting data from Supabase:', deleteError.message);
            return new Response(JSON.stringify({ error: 'Error deleting data from Supabase. See backend logs.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        console.log('Successfully deleted data from Supabase:', deleteData);
        // load into supabase table
        const { data, error } = await supabase.from('events').upsert(resp);
        if (error) {
            console.error('Error loading data into Supabase:', error.message);
            return new Response(JSON.stringify({ error: 'Error loading data into Supabase. See backend logs.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        console.log('Successfully scraped Eventbrite and loaded into Supabase:', data);
        return new Response(JSON.stringify(resp), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Error scraping Eventbrite:', error.message);
        return new Response(JSON.stringify({ error: 'Error scraping Eventbrite. See backend logs.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
async function scrapeEventBrite() {
    try {
        let currentPage = 1;
        let base_url = 'https://www.eventbrite.sg/d/singapore--singapore/music--events/?aff=oddtdtcreator&page=';
        let url = base_url + currentPage

        let encodedUrl = encodeURI(url);
        let eventIds = [];
        let hasEventIds = true;
        while (currentPage <= 100 && hasEventIds) {
            console.log('Received scraping request for: ' + url);
            let { data } = await axios.get(encodedUrl, { timeout: 5000 });
            const $ = cheerio.load(data);
            const eventCardLinks = $('a.event-card-link');
            let thisPageEventIds = [];
            eventCardLinks.each((index, element) => {
                thisPageEventIds.push($(element).attr('data-event-id'));
            });
            thisPageEventIds = [...new Set(thisPageEventIds)];
            eventIds = eventIds.concat(thisPageEventIds);
            if (eventCardLinks.length === 0) {
                hasEventIds = false;
            } else {
                currentPage++;
                url = base_url + currentPage;
                encodedUrl = encodeURI(url);
            }
            console.log('# extracted Event IDs from page:', thisPageEventIds.length);
        }

        console.log('Extracted all Event IDs!:', eventIds);

        // for each eventId, scrape the event details using api.
            // example: https://www.eventbriteapi.com/v3/events/941782967207/
            // Headers - Authorization: Bearer <token>
        const token = process.env.EVENTBRITE_API_TOKEN || 'MWIREWBIOUEH6LBQRTQT'; //TODO: remove hardcode
        const extractedEvents = [];
        for (let eventId of eventIds) {
            const eventUrl = `https://www.eventbriteapi.com/v3/events/${eventId}/`;
            console.log('Extracting event details using api:', eventUrl)
            const { data } = await axios.get(eventUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (data.name.text.toLowerCase().includes("trial") || data.name.text.toLowerCase().includes("course")) {
                continue;
            }
            // call venue api to get location
            const venueUrl = `https://www.eventbriteapi.com/v3/venues/${data.venue_id}/`;
            const { data: venueData } = await axios.get(venueUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log('Extracted venue details for ' + eventId);
            // extract event description
            const descriptionUrl = `https://www.eventbriteapi.com/v3/events/${eventId}/description`;
            const { data: descriptionData } = await axios.get(descriptionUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log('Extracted description for ' + eventId);

            // FOR NOW only get name, description, summary, logo, start, end, venue_id from data
            let data_selected = {
                name: data.name.text,
                summary: data.summary, // NEW
                description: descriptionData.description,
                performanceStart: data.start.utc,
                performanceEnd: data.end.utc,
                location: venueData.name,
                realLifeLocation: venueData.name,//venueData.address.localized_address_display,
                performerIds: "eventbrite",
                ext_url: data.url, // NEW
                logo_url: data.logo.url, // NEW
            }
            
            
            extractedEvents.push(data_selected);
            console.log("Extracted event details for id "+ eventId)
        }


        console.log('Finished extraction of all Event details!', extractedEvents);
        return extractedEvents;

        
    } catch (error) {
        console.error('Error occurred :', error.message);
        return null;
    }
}
