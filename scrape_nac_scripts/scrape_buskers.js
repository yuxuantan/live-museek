import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import cheerio from 'cheerio';

async function scrapeWebsite() {
    // connect to db
    const supabase = createClient('https://mlbwzkspmgxhudfnsfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sYnd6a3NwbWd4aHVkZm5zZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY1NzA5NDIsImV4cCI6MjAzMjE0Njk0Mn0.j-2nIAYjiFGMPfaaVAm18SfZxUbY4g57kjbo_RjaBYg')
    const { data, error } = await supabase.from('performances').select()
    if (error) {
        console.log("Error fetching performances")
    } else {
        console.log("Fetching success")
    }
    // get count data
    console.log("num performances: " + data.length)
    // get unique busker_ids from the performances table
    let busker_ids = []
    data.forEach(performance => {
        busker_ids.push(performance.busker_id)
    })
    busker_ids = [...new Set(busker_ids)]
    // console.log(busker_ids)
    busker_ids.forEach(busker_id => {
        console.log(busker_id)
    })

    // for each busker_id, get busker details from website using axios
    let busker_list = []
    await Promise.all(busker_ids.map(async (busker_id) => {
        const busker_url = `https://eservices.nac.gov.sg/Busking/busker/profile/${busker_id}`;
        const response = await axios.get(busker_url);
        const $ = cheerio.load(response.data);

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
            "image_url": busker_image_url,
            "socials": busker_socials,
        };
        console.log(busker);
        busker_list.push(busker);
    }));
    // // delete all buskers in buskers table
    // const response = await supabase.from('buskers').delete().eq('id', 1) // delete all buskers with id >1 means delete all buskers
    // if (response.error != null) {
    //     console.log("Error deleting buskers")
    //     console.log(response)
    // } else {
    //     console.log("Buskers deleted successfully")
    // }

    // insert all buskers in buskers_list into buskers table
    const response2 = await supabase.from('buskers').upsert(busker_list, { onConflict: 'busker_id' })
    if (response2.error != null) {
        console.log("Error inserting buskers")
        console.log(response2)
    } else {
        console.log("Buskers upserted successfully")
    }

}

scrapeWebsite();

