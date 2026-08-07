import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-5">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight">404</h1>
      <h2 className="text-lg font-medium text-muted-foreground">
        Az oldal nem található
      </h2>
      <p className="max-w-md text-sm text-muted-foreground/80">
        A keresett oldal nem létezik vagy eltávolításra került.
      </p>
      <Button asChild variant="outline" className="mt-2 gap-2">
        <a href="/">
          <Home className="h-4 w-4" />
          Vissza a kezdőlapra
        </a>
      </Button>
    </div>
  );
}