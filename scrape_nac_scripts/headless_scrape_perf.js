import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import cheerio from 'cheerio';

async function scrapeWebsite() {
    // init supabase
    const supabase = createClient('https://mlbwzkspmgxhudfnsfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sYnd6a3NwbWd4aHVkZm5zZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY1NzA5NDIsImV4cCI6MjAzMjE0Njk0Mn0.j-2nIAYjiFGMPfaaVAm18SfZxUbY4g57kjbo_RjaBYg')


    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://eservices.nac.gov.sg/Busking/');

    // Get the page content
    let content = await page.content();
    const $ = cheerio.load(content);

    // Get all the option elements inside location element
    const location = $('#Location');
    const options = location.find('option');
    const num_locations = options.length;

    // Array to collect all the scraped data
    const allEvents = [];
    let counter = 1
    let performances_list = [];
    for (const element of options.toArray()) {

        let location_name = $(element).text();
        let location_id = $(element).val();
        if (location_id === "00000000-0000-0000-0000-000000000000") {
            continue; // Skip invalid location
        }

        console.log(`Scraping location #${counter}/${num_locations}: ${location_name}`);
        counter += 1
        const location_url = `https://eservices.nac.gov.sg/Busking/locations/${location_id}/events`;
        await page.goto(location_url, { timeout: 60000 });
        // get the HTML content
        let content = await page.content();
        // If any text inside contains "No Records found"
        if (content.includes("No Records found")) {
            console.log("No events found for location: " + location_name);
            continue;
        }


        // Click the "more" button on the location events page until it disappears
        let moreButtonExistsLocation = true;
        while (moreButtonExistsLocation) {
            try {
                await page.waitForSelector('#div-load-booking-grid-more', { timeout: 5000 });
                await page.click('#div-load-booking-grid-more');
                console.log('Clicked more button');
                // sleep 1 seconds to wait for the page to load
                await new Promise(r => setTimeout(r, 1000))
                // Check if the button is still visible
                const moreButtonStyle = await page.$eval('#div-load-booking-grid-more', button => getComputedStyle(button).display);
                if (moreButtonStyle === 'none') {
                    moreButtonExistsLocation = false; // Stop clicking if button is hidden
                }
            } catch (error) {
                moreButtonExistsLocation = false; // Stop clicking if button is not found or times out
                console.error('Error while clicking more button:', error);
            }
        }

        // Get the page content after all events are loaded
        const locationContent = await page.content();
        const locationPage = cheerio.load(locationContent);
        // get the div with id = "div-header", 
        const location_address_header = locationPage('#div-header')
        // get the first child with ul
        const location_address_ul = location_address_header.find('ul').first();
        // then get the first li with "dash-bx-times" class
        const location_address = location_address_ul.find('li.dash-bx-times').first().text().trim();

        console.log("Done loading the page: " + location_name);
        const events = locationPage('#div-booking-result-view');
        const event_divs = events.find('.col-md-6.col-lg-2.col-cuttor');

        event_divs.each((index, element) => {

            // const performer_name = $(element).find('h3').text().trim();
            const busker_id_url = $(element).find('h3 a').attr('href');
            const busker_id = busker_id_url.substring(busker_id_url.indexOf('/profile/') + '/profile/'.length);
            const performance_times = $(element).find('.dash-bx-times');
            // first one is date, second one is time. combine the 2 to get the full date and time of the event
            const date = performance_times.children().first().text().trim() + ' ' + new Date().getFullYear();
            const time = performance_times.children().eq(1).text().trim()
            // (busker_id, location_id, location_name, location_address, start_datetime, end_datetime, created_at)
            const performance = {
                busker_id: busker_id,
                location_id: location_id,
                location_name: location_name,
                location_address: location_address,
                //date = 'Sat, 28 September'; time= '04:00:PM-06:00:PM'
                // year = this year
                start_datetime: new Date(date + ' ' + time.split('-')[0]), // UTC
                end_datetime: new Date(date + ' ' + time.split('-')[1]), // UTC
            };
            console.log(performance);
            performances_list.push(performance);

        });

        console.log('Done scraping location: ' + location_name);
    }
    // write all event objects in performances_list to the database 'events' table. (busker_id, location_id, location_name, location_address, start_datetime, end_datetime, created_at)
    // write to supabase
    // clear the db table 'performances'
    console.log('Done scraping all locations. Clearing performances table');
    const response = await supabase.from('performances').delete().gt('event_id', 0) // delete all event_id > 0 means delete all
    if (response.error != null) {
        throw response.error;
    }
    else {
        console.log('Cleared performances table');
    }

    const { error } = await supabase.from('performances').insert(performances_list)
    if (error == null) {
        console.log('Done writing all performances to supabase');
    }
    else {
        throw error;
    }
    await browser.close();
}

scrapeWebsite();


// steps. every day scheduled scraping (have to increase frequency or do it on the fly)
// 1. get all location options on NAC website (location name and id)
// 2. go to location page, click more button (if "no records found" dont exist) until all events are loaded
// 3. create an empty performances_list array. get list of performance elements from the page. 
// 4. for each performance element, 
// create an performance object with (busker_id, location_id, location_name, location_address, start_datetime, end_datetime, created_at)
// add the performance object to the performances_list array
// 5. clear the db table 'performances'
// 6. write all event objects in performances_list to the database 'events' table. (busker_id, location_id, location_name, location_address, start_datetime, end_datetime, created_at)
// 7. get list of unique busker IDs from the performances_list array. create a buskers_list array
// 8. for each busker id, 
// navigate to busker page.
// scrape (busker id, name, act, art_form,  bio (optional), image_url, socials ) and insert busker object into busker_list
// 9. clear the db table busker
// 10. write all busker objects in busker_list to the database 'busker' table. (busker_id, name, act, art_form, bio, image_url, socials, created_at)
