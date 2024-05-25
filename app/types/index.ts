// types/index.ts
export interface Musician {
  id: number;
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
  eventId: number;
  name: string;
  location: string;
  realLifeLocation: string;
  performerId: number;
  musicGenres: string[];
  performanceStart: string;
  performanceEnd: string;
}