// types/index.ts
export interface Musician {
  id: string;
  name: string;
  genre: string;
  language: string;
  location: string;
  bio: string;
  facebook: string;
  twitter: string;
  instagram: string;
}

export interface Event {
  eventId: number | null; // null for new events, number for existing events
  name: string;
  description: string;
  location: string;
  realLifeLocation: string;
  performerIds: string[];
  musicGenres: string[];
  performanceStart: Date; // datetime 
  performanceEnd: Date; // datetime 
  logo_url: string;
  ext_url: string;
  summary: string;
}