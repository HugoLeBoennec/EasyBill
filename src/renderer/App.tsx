import {
  MemoryRouter as Router,
  Routes,
  Route,
  Outlet,
  NavLink,
  useLocation,
} from 'react-router-dom';
import Setting from './Setting';
import Billing from './Billing';
import Dashboard from './Dashboard';
import 'tailwindcss/tailwind.css';
import './App.css';

const Navbar = () => {
  const navLink = ['Dashboard', 'Billing', 'Setting'];
  const navs = navLink.map((name) => (
    <NavLink className="py-2" to={`/${name.toLowerCase()}`}>
      {name}
    </NavLink>
  )); // bg-current
  return (
    <div className="flex flex-col justify-start w-1/5 bg-gray-800 h-screen">
      {navs}
    </div>
  );
};

const Base = () => {
  return (
    <div className="flex">
      <Navbar />
      <div className="p-5 w-full">
        <h1 className="p-2 bg-slate-900">Hello World!</h1>
        <Outlet />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Base />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="billing" element={<Billing />} />
          <Route path="setting" element={<Setting />} />
        </Route>
      </Routes>
    </Router>
  );
}
