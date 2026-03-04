// get list of all locations from main page drop downlist, navigates to each location page, clicking more button until all events are loaded, then scrapes all events
import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
import { createScraperSupabaseClient } from './supabase_client.js';

function parseCsvArg(value) {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseCliArgs(argv) {
    const args = {
        limit: null,
        locationIds: new Set(),
        locationNames: [],
        dryRun: false,
        allowPartialWrite: false,
    };

    for (const rawArg of argv) {
        if (rawArg.startsWith('--limit=')) {
            const limitValue = Number.parseInt(rawArg.substring('--limit='.length), 10);
            if (!Number.isNaN(limitValue) && limitValue > 0) {
                args.limit = limitValue;
            }
            continue;
        }

        if (rawArg.startsWith('--location-id=')) {
            const values = parseCsvArg(rawArg.substring('--location-id='.length));
            values.forEach((value) => args.locationIds.add(value));
            continue;
        }

        if (rawArg.startsWith('--location-name=')) {
            const values = parseCsvArg(rawArg.substring('--location-name='.length)).map((value) => value.toLowerCase());
            args.locationNames.push(...values);
            continue;
        }

        if (rawArg === '--dry-run') {
            args.dryRun = true;
            continue;
        }

        if (rawArg === '--allow-partial-write') {
            args.allowPartialWrite = true;
            continue;
        }
    }

    return args;
}

async function scrapeWebsite() {
    // init supabase
    const supabase = createScraperSupabaseClient();
    const cliArgs = parseCliArgs(process.argv.slice(2));


    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://eservices.nac.gov.sg/Busking/');

    // Get the page content
    let content = await page.content();
    const $ = cheerio.load(content);

    // Get all the option elements inside location element
    const location = $('#Location');
    const optionElements = location.find('option');
    const allLocations = optionElements
        .toArray()
        .map((element) => ({
            location_name: $(element).text().trim(),
            location_id: $(element).val(),
        }))
        .filter((entry) => entry.location_id !== "00000000-0000-0000-0000-000000000000");

    let targetLocations = allLocations;

    if (cliArgs.locationIds.size > 0) {
        targetLocations = targetLocations.filter((entry) => cliArgs.locationIds.has(entry.location_id));
    }

    if (cliArgs.locationNames.length > 0) {
        targetLocations = targetLocations.filter((entry) =>
            cliArgs.locationNames.some((needle) => entry.location_name.toLowerCase().includes(needle))
        );
    }

    if (cliArgs.limit != null) {
        targetLocations = targetLocations.slice(0, cliArgs.limit);
    }

    const hasFilters = cliArgs.locationIds.size > 0 || cliArgs.locationNames.length > 0 || cliArgs.limit != null;
    const shouldWriteToDb = !cliArgs.dryRun && (!hasFilters || cliArgs.allowPartialWrite);

    console.log(
        `Selected ${targetLocations.length}/${allLocations.length} locations ` +
        `(limit=${cliArgs.limit ?? 'none'}, ids=${cliArgs.locationIds.size}, names=${cliArgs.locationNames.length}, dryRun=${cliArgs.dryRun})`
    );
    if (!shouldWriteToDb) {
        console.log('Subset/dry-run mode active. Database overwrite is disabled for this run.');
    }
    if (hasFilters && cliArgs.allowPartialWrite) {
        console.log('WARNING: --allow-partial-write enabled. This run can overwrite performances with partial data.');
    }
    if (targetLocations.length === 0) {
        console.log('No locations match the current filters. Exiting.');
        await browser.close();
        process.exitCode = 1;
        return;
    }

    // Array to collect all the scraped data
    let counter = 1
    let performances_list = [];
    const num_locations = targetLocations.length;
    for (const locationEntry of targetLocations) {
        const location_name = locationEntry.location_name;
        const location_id = locationEntry.location_id;

        
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

        console.log("Done loading the page: " + location_name);
        const events = locationPage('#div-booking-result-view');
        const eventDivs = events.find('.col-cuttor');
        const profileLinks = events.find('a[href*="/profile/"]');
        let parsedForLocation = 0;
        let skippedNoLink = 0;
        let skippedNoTime = 0;
        let skippedInvalidDate = 0;

        // Prefer event card wrappers when present, fallback to profile links if DOM classes changed.
        const rowsToParse = eventDivs.length > 0 ? eventDivs : profileLinks;
        console.log(`Location parse candidates: ${rowsToParse.length} (cards=${eventDivs.length}, links=${profileLinks.length})`);

        rowsToParse.each((index, element) => {
            const scope = eventDivs.length > 0
                ? locationPage(element)
                : locationPage(element).closest('div');
            const busker_id_url =
                scope.find('h3 a[href*="/profile/"]').attr('href') ??
                scope.find('a[href*="/profile/"]').attr('href');
            if (!busker_id_url) {
                skippedNoLink += 1;
                return;
            }
            const profileMarker = '/profile/';
            const profileIndex = busker_id_url.indexOf(profileMarker);
            if (profileIndex === -1) {
                skippedNoLink += 1;
                return;
            }
            const busker_id = busker_id_url.substring(profileIndex + profileMarker.length).split('?')[0].split('/')[0];
            const performance_times = scope.find('.dash-bx-times');
            // first one is date, second one is time. combine the 2 to get the full date and time of the event
            const dateText = performance_times.children().first().text().trim();
            const timeText = performance_times.children().eq(1).text().trim();
            if (!dateText || !timeText) {
                skippedNoTime += 1;
                return;
            }
            const normalizedTimeText = timeText.replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-');
            const [startTimeRaw, endTimeRaw] = normalizedTimeText.split('-');
            if (!startTimeRaw || !endTimeRaw) {
                skippedNoTime += 1;
                return;
            }
            const startTime = startTimeRaw.trim();
            const endTime = endTimeRaw.trim();
            const date = dateText + ' ' + new Date().getFullYear();
            const startDateTime = new Date(date + ' ' + startTime);
            const endDateTime = new Date(date + ' ' + endTime);
            if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
                skippedInvalidDate += 1;
                return;
            }
            // (busker_id, location_id, location_name, location_address, start_datetime, end_datetime, created_at)
            const performance = {
                busker_id: busker_id,
                location_id: location_id,
                //date = 'Sat, 28 September'; time= '04:00:PM-06:00:PM'
                // year = this year
                start_datetime: startDateTime, // UTC
                end_datetime: endDateTime, // UTC
            };
            console.log(performance);
            performances_list.push(performance);
            parsedForLocation += 1;

        });

        console.log(
            `Parsed ${parsedForLocation} performances from ${location_name} ` +
            `(skipped: no-link=${skippedNoLink}, no-time=${skippedNoTime}, invalid-date=${skippedInvalidDate})`
        );
        console.log('Done scraping location events: ' + location_name);
    }

    // write all event objects in performances_list to the database 'events' table. (busker_id, location_id, location_name, location_address, start_datetime, end_datetime, created_at)
    // write to supabase
    if (performances_list.length === 0) {
        console.log('No performances scraped. Skipping database overwrite to avoid deleting existing rows.');
        await browser.close();
        process.exitCode = 1;
        return;
    }
    if (!shouldWriteToDb) {
        console.log(`Scrape finished with ${performances_list.length} performances. Skipping DB write in subset/dry-run mode.`);
        await browser.close();
        return;
    }
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
