// TODO: only scrape buskers in performances table that doesnt exist in the buskers table
import cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { createScraperSupabaseClient } from './supabase_client.js';

async function scrapeWebsite() {
    // connect to db
    const supabase = createScraperSupabaseClient();
    const { data, error } = await supabase.from('performances').select('busker_id');
    let busker_list = [];

    if (error) {
        console.log("Error fetching performances");
        console.log(error);
        return;
    } else {
        console.log("Fetching success");
    }

    // get count data
    const performances = data ?? [];
    console.log("num performances: " + performances.length);
    if (performances.length === 0) {
        console.log("No performances found. Skipping busker scraping.");
        return;
    }

    // get unique busker_ids from the performances table
    let busker_ids = [];
    performances.forEach((performance) => {
        if (performance.busker_id) {
            busker_ids.push(performance.busker_id);
        }
    });
    busker_ids = [...new Set(busker_ids)];

    // fetch distinct busker ids from buskers table and remove them from busker_ids which will be used for scraping
    const { data: buskers_data, error: buskers_error } = await supabase.from('buskers').select('busker_id');
    if (buskers_error) {
        console.log("Error fetching buskers");
        console.log(buskers_error);
        return;
    }
    const buskers = (buskers_data ?? []).map((busker) => busker.busker_id);
    busker_ids = busker_ids.filter(busker_id => !buskers.includes(busker_id));
    if (busker_ids.length === 0) {
        console.log("No new buskers found. Exiting script.");
        return;
    }
    

    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    for (const busker_id of busker_ids) {
        console.log(busker_id);
        const busker_url = `https://eservices.nac.gov.sg/Busking/busker/profile/${busker_id}`;
        await page.goto(busker_url, { timeout: 60000 });
        const html = await page.content();
        const $ = cheerio.load(html);

        // get busker details
        const div_header = $('#div-header');
        const busker_name = div_header.find('h2').text().trim();
        const busker_act = div_header.find('span').text().trim();
        const busker_art_form = $('.card-details-bg').find('ul').find('li').eq(2).text().replace('Art Form: ', '').trim();
        const busker_bio = div_header.find('p').text();
        const busker_socials = div_header.find('li').find('a').map((index, element) => $(element).attr('href')).get().join(', ');
        const busker_image_url = $('#profileImage').attr('src');
        const busker = {
            "busker_id": busker_id,
            "name": busker_name,
            "act": busker_act,
            "art_form": busker_art_form,
            "bio": busker_bio,
            "socials": busker_socials,
            "updated_at": new Date()
        };
        console.log(busker);

        // Download image using Puppeteer
        if (busker_image_url) {
            const image_url_full = `https://eservices.nac.gov.sg${busker_image_url}`;
            const response = await page.goto(image_url_full, { timeout: 60000 });
            const image_data = await response.buffer();

            // Upload image to Supabase storage
            const image_upload_response = await supabase.storage
                .from('busker_images')
                .upload(`${busker_id}.jpg`, image_data, { contentType: 'image/jpg', upsert: true });

            if (image_upload_response.error != null) {
                console.log("Error uploading image");
                console.log(image_upload_response);
            }
        } else {
            console.log(`No profile image found for busker ${busker_id}`);
        }
        busker_list.push(busker);
    }

    await browser.close();
    if (busker_list.length === 0) {
        console.log("No buskers scraped. Skipping database write.");
        return;
    }

    // Insert all buskers in buskers_list into buskers table
    const upsertResponse = await supabase.from('buskers').upsert(busker_list, { onConflict: 'busker_id' });
    if (upsertResponse.error?.code === '42P10') {
        console.log("Missing unique constraint for upsert conflict target. Falling back to insert.");
        const insertResponse = await supabase.from('buskers').insert(busker_list);
        if (insertResponse.error != null) {
            console.log("Error inserting buskers");
            console.log(insertResponse);
            return;
        }
        console.log("Buskers inserted successfully");
        return;
    }
    if (upsertResponse.error != null) {
        console.log("Error inserting buskers");
        console.log(upsertResponse);
    } else {
        console.log("Buskers upserted successfully");
    }
}

scrapeWebsite();
