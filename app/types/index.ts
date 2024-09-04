// types/index.ts
// (busker_id, location_id, location_name, location_address, start_datetime, end_datetime, created_at)
export interface Performance {
    busker_id: string;
    location_id: string;
    location_name: string;
    location_address: string;
    start_datetime: Date;
    end_datetime: Date;
    created_at: string;
}

// (busker_id, name, act, art_form, bio, image_url, socials, created_at)
export interface Busker {

}