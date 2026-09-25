import { redirect } from 'next/navigation';

/** Laravel: Route::redirect('/', '/dashboard'). */
export default function HomePage() {
  redirect('/dashboard');
}
