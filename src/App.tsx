import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import ProductPage from "./pages/Product";
import Cart from "./pages/Cart";
import RequestOrder from "./pages/RequestOrder";
import FitFinder from "./pages/FitFinder";
import SizeGuide from "./pages/SizeGuide";
import Compare from "./pages/Compare";
import { GuidePage, GuidesIndex } from "./pages/Guides";
import { About, Brands, Clinicians, Contact, Faq, PolicyPage } from "./pages/Info";
import NotFound from "./pages/NotFound";

/* Every address the site answers. scripts/prerender.mjs mirrors this list. */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop mode="all" />} />
        <Route path="shop/:region" element={<Shop mode="region" />} />
        <Route path="category/:slug" element={<Shop mode="category" />} />
        <Route path="brands" element={<Brands />} />
        <Route path="brands/:slug" element={<Shop mode="brand" />} />
        <Route path="product/:slug" element={<ProductPage />} />
        <Route path="cart" element={<Cart />} />
        <Route path="request-order" element={<RequestOrder />} />
        <Route path="fit-finder" element={<FitFinder />} />
        <Route path="size-guide" element={<SizeGuide />} />
        <Route path="compare" element={<Compare />} />
        <Route path="guides" element={<GuidesIndex />} />
        <Route path="guides/:slug" element={<GuidePage />} />
        <Route path="clinicians" element={<Clinicians />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="faq" element={<Faq />} />
        <Route path="policies/:slug" element={<PolicyPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
