/**
 * App routing shell for the viewer portal.
 */
import { lazy } from "react";
import { Route, Routes } from "react-router-dom";

import Layout from "./app/layout/Layout";
import { FilterProvider } from "./state/filters";

const Home = lazy(() => import("./app/routes/Home"));
const SalesOverview = lazy(() => import("./app/routes/SalesOverview"));
const SalesBundlePage = lazy(() => import("./app/routes/SalesBundlePage"));
const CurrentChoice = lazy(() => import("./app/routes/CurrentChoice"));
const Setup = lazy(() => import("./app/routes/Setup"));
const CommandCenter = lazy(() => import("./app/routes/CommandCenter"));
const Purchases = lazy(() => import("./app/routes/Purchases"));
const LibraryCategory = lazy(() => import("./app/routes/LibraryCategory"));
const SteamKeys = lazy(() => import("./app/routes/SteamKeys"));
const OtherKeys = lazy(() => import("./app/routes/OtherKeys"));
const OtherDownloads = lazy(() => import("./app/routes/OtherDownloads"));
const Software = lazy(() => import("./app/routes/Software"));
const Videos = lazy(() => import("./app/routes/Videos"));
const EBooksPage = lazy(() => import("./app/routes/EBooksPage"));
const Audiobooks = lazy(() => import("./app/routes/Audiobooks"));
const ExpiringKeys = lazy(() => import("./app/routes/ExpiringKeys"));
const Schema = lazy(() => import("./app/routes/Schema"));

/**
 * Root app component that wires routing and global filter context.
 */
export default function App() {
  return (
    <FilterProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/sales" element={<SalesOverview />} />
          <Route
            path="/sales/games"
            element={<SalesBundlePage bundleType="games" />}
          />
          <Route
            path="/sales/books"
            element={<SalesBundlePage bundleType="books" />}
          />
          <Route
            path="/sales/software"
            element={<SalesBundlePage bundleType="software" />}
          />
          <Route path="/sales/choice" element={<CurrentChoice />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/command-center" element={<CommandCenter />} />
          <Route path="/library/purchases" element={<Purchases />} />
          <Route path="/library/category/:category" element={<LibraryCategory />} />
          <Route path="/library/steam-keys" element={<SteamKeys />} />
          <Route path="/library/other-keys" element={<OtherKeys />} />
          <Route path="/library/expiring-keys" element={<ExpiringKeys />} />
          <Route path="/library/other-downloads" element={<OtherDownloads />} />
          <Route path="/library/software" element={<Software />} />
          <Route path="/library/videos" element={<Videos />} />
          <Route path="/library/ebooks" element={<EBooksPage />} />
          <Route path="/library/audiobooks" element={<Audiobooks />} />
          <Route path="/schema" element={<Schema />} />
        </Route>
      </Routes>
    </FilterProvider>
  );
}
