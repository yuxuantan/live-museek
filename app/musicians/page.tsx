import Link from 'next/link';

interface Musician {
  id: number;
  name: string;
  genre: string;
  bio: string;
}

const musicians: Musician[] = [
  { id: 1, name: 'John Doe', genre: 'Rock', bio: 'Rock musician from LA' },
  { id: 2, name: 'Jane Smith', genre: 'Jazz', bio: 'Jazz musician from NY' },
];

export default function MusiciansPage() {
  return (
    <div>
      <h1>Musicians</h1>
      <ul>
        {musicians.map(musician => (
          <li key={musician.id}>
            <Link href={`/musicians/${musician.id}`}>{musician.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
