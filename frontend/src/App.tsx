/**
 * App routing shell for the viewer portal.
 */
import { lazy } from "react";
import { Route, Routes } from "react-router-dom";

import Layout from "./app/layout/Layout";
import { FilterProvider } from "./state/filters";

const Overview = lazy(() => import("./app/routes/Overview"));
const CurrentBundles = lazy(() => import("./app/routes/CurrentBundles"));
const CurrentSalesOverview = lazy(
  () => import("./app/routes/CurrentSalesOverview"),
);
const VenueBundlePage = lazy(() => import("./app/routes/VenueBundlePage"));
const VenueChoice = lazy(() => import("./app/routes/VenueChoice"));
const LibrarySetup = lazy(() => import("./app/routes/LibrarySetup"));
const CommandCenter = lazy(() => import("./app/routes/CommandCenter"));
const Orders = lazy(() => import("./app/routes/Orders"));
const Category = lazy(() => import("./app/routes/Category"));
const SteamKeys = lazy(() => import("./app/routes/SteamKeys"));
const NonSteamKeys = lazy(() => import("./app/routes/NonSteamKeys"));
const Downloads = lazy(() => import("./app/routes/Downloads"));
const Software = lazy(() => import("./app/routes/Software"));
const Videos = lazy(() => import("./app/routes/Videos"));
const Ebooks = lazy(() => import("./app/routes/Ebooks"));
const Audiobooks = lazy(() => import("./app/routes/Audiobooks"));
const ExpiringKeys = lazy(() => import("./app/routes/ExpiringKeys"));
const Structure = lazy(() => import("./app/routes/Structure"));

/**
 * Root app component that wires routing and global filter context.
 */
export default function App() {
  return (
    <FilterProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/current-bundles" element={<CurrentBundles />} />
          <Route path="/venue/overview" element={<CurrentSalesOverview />} />
          <Route
            path="/venue/bundles/games"
            element={<VenueBundlePage bundleType="games" />}
          />
          <Route
            path="/venue/bundles/books"
            element={<VenueBundlePage bundleType="books" />}
          />
          <Route
            path="/venue/bundles/software"
            element={<VenueBundlePage bundleType="software" />}
          />
          <Route path="/venue/choice" element={<VenueChoice />} />
          <Route path="/setup" element={<LibrarySetup />} />
          <Route path="/commands" element={<CommandCenter />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/category/:category" element={<Category />} />
          <Route path="/steam-keys" element={<SteamKeys />} />
          <Route path="/non-steam-keys" element={<NonSteamKeys />} />
          <Route path="/expiring-keys" element={<ExpiringKeys />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/software" element={<Software />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/ebooks" element={<Ebooks />} />
          <Route path="/audiobooks" element={<Audiobooks />} />
          <Route path="/structure" element={<Structure />} />
        </Route>
      </Routes>
    </FilterProvider>
  );
}
