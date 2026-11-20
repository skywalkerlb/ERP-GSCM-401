import { Link } from 'react-router-dom';
import { isDemo } from '@/lib/supabase';
export function BusinessSetupLink() {
  return isDemo ? null : <p className="auth-foot text-body-sm"><Link className="gz-link" to="/create-business">Create a business</Link></p>;
}
