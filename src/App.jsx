import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Wallet, Droplet, ListFilter,
  LayoutDashboard, Package, Download, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  ClipboardCheck, Link2, CheckCircle2, Settings, Pencil, BarChart3, Banknote, Landmark,
  Lock, Unlock, LogOut, X, ShoppingCart, ClipboardList,
} from "lucide-react";

// ---------- palette / tokens ----------
const C = {
  bg: "#F1F5EE",
  card: "#FFFFFF",
  primary: "#1F4D3F",
  primaryLight: "#2C6E58",
  mango: "#F0932B",
  berry: "#C2447A",
  cream: "#FBF6E9",
  ink: "#22302A",
  inkSoft: "#5C6B63",
  line: "#DFE7DC",
  warn: "#D9822B",
  loss: "#B23B3B",
};

// ---------- Menu Trà Na (dữ liệu khởi tạo — có thể sửa trong app ở tab Menu) ----------
const DEFAULT_MENU = [
  { name: "Trà Dâu", price: 25000 },
  { name: "Trà Dâu Tằm", price: 25000 },
  { name: "Trà Mãng Cầu", price: 25000 },
  { name: "Trà Nhãn", price: 22000 },
  { name: "Trà Ổi Hồng", price: 20000 },
  { name: "Trà Xoài Chanh Dây", price: 20000 },
  { name: "Trà Thơm Chanh Dây", price: 20000 },
  { name: "Trà Cóc Cóc", price: 20000 },
  { name: "Trà Chanh Dây", price: 15000 },
  { name: "Trà Đào", price: 20000 },
  { name: "Trà Dưa Lưới", price: 25000 },
  { name: "Bánh Tráng Tự Trộn", price: 25000 },
];
const MENU_KHAC = { name: "Khác", price: null };
const DEFAULT_EXPENSE_CATEGORIES = [
  "Nguyên liệu", "Bao bì (ly, ống hút)", "Mặt bằng", "Nhân công",
  "Điện nước", "Giao hàng", "Marketing", "Khác",
];
const CHANNELS = [
  { key: "Tại quầy", defaultFee: 0, defaultMarkupAmount: 0 },
  { key: "Tự giao hàng", defaultFee: 0, defaultMarkupAmount: 0 },
  { key: "GrabFood", defaultFee: 20, defaultMarkupAmount: 3000 },
  { key: "ShopeeFood", defaultFee: 20, defaultMarkupAmount: 3000 },
  { key: "BeFood", defaultFee: 20, defaultMarkupAmount: 3000 },
  { key: "Xanh SM", defaultFee: 15, defaultMarkupAmount: 2000 },
  { key: "Khác", defaultFee: 0, defaultMarkupAmount: 0 },
];
const UNITS = ["kg", "g", "lít", "ml", "ly", "gói", "chai", "hộp", "cái", "khác"];
const PAYMENT_METHODS = ["Tiền mặt", "Chuyển khoản"];
const LOSS_REASONS = ["Hao hụt / hỏng", "Kiểm kho - hao hụt"];

const STORAGE_KEY = "quan-nuoc-so-thu-chi";
const ADMIN_PASS = "123123";
const ADMIN_FLAG_KEY = "tra-na-admin-unlocked";

const todayISO = () => new Date().toLocaleDateString("en-CA");
const monthPrefix = () => todayISO().slice(0, 7);
const fmtVND = (n) => (Number(n) || 0).toLocaleString("vi-VN") + " đ";
const fmtNum = (n) => (Number(n) || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function loadFonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
      * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
      .ff-display { font-family: 'Fraunces', serif; }
      .ff-mono { font-family: 'IBM Plex Mono', monospace; }
      input, select { font-family: 'Inter', sans-serif; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 4px; }
      @keyframes riseIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    `}</style>
  );
}

// ---------- stock helpers ----------
// recipeLinks: [{ itemName, yieldPerUnit }] — mỗi món liên kết có định mức pha chế riêng,
// vì cùng 1 nguyên liệu có thể hao hụt khác nhau giữa các món (VD: Mãng Cầu dùng nhiều hơn ở
// Trà Mãng Cầu nguyên chất so với Trà Mãng Cầu Mix Dâu Tằm).
function linkedItemsOf(ing) {
  if (Array.isArray(ing.recipeLinks)) return ing.recipeLinks.map((r) => r.itemName);
  if (Array.isArray(ing.linkedItems)) return ing.linkedItems;
  if (ing.linkedItem) return [ing.linkedItem];
  return [];
}
function yieldForItem(ing, itemName) {
  if (ing.shared) return Number(ing.yieldPerUnit) || 0;
  if (Array.isArray(ing.recipeLinks)) {
    const link = ing.recipeLinks.find((r) => r.itemName === itemName);
    return link ? Number(link.yieldPerUnit) || 0 : 0;
  }
  // dữ liệu cũ: 1 định mức chung áp dụng cho các món đã liên kết
  return linkedItemsOf(ing).includes(itemName) ? Number(ing.yieldPerUnit) || 0 : 0;
}
function stockOf(ing, stockMovements) {
  const inSum = stockMovements.filter((m) => m.ingredientId === ing.id && m.type === "in").reduce((s, m) => s + Number(m.quantity), 0);
  const outSum = stockMovements.filter((m) => m.ingredientId === ing.id && m.type === "out").reduce((s, m) => s + Number(m.quantity), 0);
  return Number(ing.initialStock || 0) + inSum - outSum;
}
function cupsLeft(ing, stockMovements, itemName) {
  const y = itemName ? yieldForItem(ing, itemName) : Number(ing.yieldPerUnit) || 0;
  if (!y || y <= 0) return null;
  return Math.floor(stockOf(ing, stockMovements) * y);
}
function recipeSummaryText(ing, stockMovements) {
  if (ing.shared) {
    if (!(Number(ing.yieldPerUnit) > 0)) return null;
    const c = cupsLeft(ing, stockMovements);
    return `1 ${ing.unit} = ${fmtNum(ing.yieldPerUnit)} ly (dùng chung mọi món)${c !== null ? ` · còn pha ~${c} ly` : ""}`;
  }
  const items = linkedItemsOf(ing);
  if (items.length === 0) return null;
  return items
    .map((nm) => {
      const y = yieldForItem(ing, nm);
      if (!(y > 0)) return `${nm}: chưa đặt định mức`;
      const c = cupsLeft(ing, stockMovements, nm);
      return `${nm}: 1${ing.unit}=${fmtNum(y)}ly${c !== null ? ` (~${c} ly)` : ""}`;
    })
    .join(" · ");
}
function avgYield(ing) {
  if (ing.shared) return Number(ing.yieldPerUnit) || 0;
  if (Array.isArray(ing.recipeLinks) && ing.recipeLinks.length) {
    const valid = ing.recipeLinks.filter((r) => Number(r.yieldPerUnit) > 0);
    if (!valid.length) return 0;
    return valid.reduce((s, r) => s + Number(r.yieldPerUnit), 0) / valid.length;
  }
  return Number(ing.yieldPerUnit) || 0;
}
function lossOf(ing, stockMovements, monthPrefixStr) {
  return stockMovements
    .filter((m) => m.ingredientId === ing.id && m.type === "out" && LOSS_REASONS.includes(m.reason) && (!monthPrefixStr || m.date.startsWith(monthPrefixStr)))
    .reduce((s, m) => s + Number(m.quantity), 0);
}

// ---------- Cup gauge (signature element) ----------
function CupGauge({ marginPct, label }) {
  const pct = Math.max(0, Math.min(100, marginPct));
  const liquidColor = marginPct >= 0 ? C.mango : C.berry;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="72" height="92" viewBox="0 0 72 92">
        <defs>
          <clipPath id="cupClip">
            <path d="M10 14 L62 14 L54 82 Q54 88 48 88 L24 88 Q18 88 18 82 Z" />
          </clipPath>
          <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={liquidColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={liquidColor} stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d="M10 14 L62 14 L54 82 Q54 88 48 88 L24 88 Q18 88 18 82 Z"
          fill={C.cream} stroke={C.primary} strokeWidth="2.5" />
        <g clipPath="url(#cupClip)">
          <rect x="10" y={88 - (pct / 100) * 74} width="52" height={(pct / 100) * 74 + 10}
            fill="url(#liquidGrad)" style={{ transition: "y 0.6s ease, height 0.6s ease" }} />
          <circle cx="30" cy={80 - (pct / 100) * 60} r="2" fill="#fff" opacity="0.7">
            <animate attributeName="cy" values={`${86 - (pct / 100) * 74};${86 - (pct / 100) * 74 - 40}`} dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.8;0" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="42" cy={80 - (pct / 100) * 60} r="1.6" fill="#fff" opacity="0.6">
            <animate attributeName="cy" values={`${86 - (pct / 100) * 74};${86 - (pct / 100) * 74 - 34}`} dur="1.7s" repeatCount="indefinite" begin="0.4s" />
            <animate attributeName="opacity" values="0;0.7;0" dur="1.7s" repeatCount="indefinite" begin="0.4s" />
          </circle>
        </g>
        <rect x="38" y="2" width="5" height="18" rx="2" fill={C.primary} transform="rotate(12 40 10)" />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div className="ff-mono" style={{ fontSize: 15, fontWeight: 600, color: marginPct >= 0 ? C.primary : C.berry }}>
          {marginPct.toFixed(0)}%
        </div>
        <div style={{ fontSize: 10.5, color: C.inkSoft }}>{label}</div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const toneColor = tone === "up" ? C.primary : tone === "down" ? C.berry : C.mango;
  return (
    <div style={{
      background: C.card, borderRadius: 16, padding: "12px 14px", flex: 1,
      border: `1px solid ${C.line}`, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Icon size={13} color={toneColor} />
        <span style={{ fontSize: 10.5, color: C.inkSoft, fontWeight: 500 }}>{label}</span>
      </div>
      <div className="ff-mono" style={{ fontSize: 15, fontWeight: 600, color: toneColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}

// ---------- Excel export ----------
function exportExcel(revenues, expenses, ingredients, stockMovements) {
  const wb = XLSX.utils.book_new();

  const revSheet = revenues.slice().sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({
    "Ngày": r.date, "Món": r.itemName, "Kênh bán": r.channel, "Số lượng": r.quantity,
    "Giá tại quầy": r.basePrice ?? "", "Đơn giá": r.unitPrice, "Thành tiền (gross)": r.total,
    "Phương thức": r.paymentMethod || "", "Chênh lệch giá kênh (đ)": r.markupAmount || "", "Phí kênh (%)": r.feePercent,
    "Tiền phí kênh": r.feeAmount, "Thực nhận": r.netAmount,
    "Khuyến mãi (đ)": r.isPromo ? r.promoAmount : "", "Ghi chú": r.note || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(revSheet.length ? revSheet : [{ "Ngày": "" }]), "Doanh thu");

  const expSheet = expenses.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({
    "Ngày": e.date, "Danh mục": e.category, "Số tiền": e.amount, "Mô tả": e.description || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expSheet.length ? expSheet : [{ "Ngày": "" }]), "Chi phí");

  const invSheet = ingredients.map((ing) => {
    const inSum = stockMovements.filter((m) => m.ingredientId === ing.id && m.type === "in").reduce((s, m) => s + Number(m.quantity), 0);
    const outSum = stockMovements.filter((m) => m.ingredientId === ing.id && m.type === "out").reduce((s, m) => s + Number(m.quantity), 0);
    const totalLoss = lossOf(ing, stockMovements, null);
    return {
      "Nguyên liệu": ing.name, "Đơn vị": ing.unit, "Món liên quan": ing.shared ? "Dùng chung tất cả món" : linkedItemsOf(ing).join(", "),
      "Định mức (ly/đơn vị)": ing.shared
        ? (ing.yieldPerUnit || "")
        : linkedItemsOf(ing).map((nm) => `${nm}: ${yieldForItem(ing, nm) || "?"}`).join("; "),
      "Tồn ban đầu": ing.initialStock,
      "Tổng nhập": inSum, "Tổng xuất": outSum, "Tồn hiện tại": Number(ing.initialStock) + inSum - outSum,
      "Ngưỡng cảnh báo": ing.lowStockThreshold, "Hao hụt luỹ kế": totalLoss,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invSheet.length ? invSheet : [{ "Nguyên liệu": "" }]), "Tồn kho");

  const movSheet = stockMovements.slice().sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    const ing = ingredients.find((i) => i.id === m.ingredientId);
    return {
      "Ngày": m.date, "Nguyên liệu": ing ? ing.name : "?", "Loại": m.type === "in" ? "Nhập" : "Xuất",
      "Lý do": m.reason || "", "Số lượng": m.quantity, "Đơn vị": ing ? ing.unit : "",
      "Đơn giá": m.unitCost || "", "Thành tiền": m.unitCost ? Number(m.unitCost) * Number(m.quantity) : "",
      "Tự động": m.auto ? "Có" : "", "Ghi chú": m.note || "",
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movSheet.length ? movSheet : [{ "Ngày": "" }]), "Nhật ký kho");

  XLSX.writeFile(wb, `so-thu-chi-quan-nuoc-${todayISO()}.xlsx`);
}

function readAdminFlag() {
  try { return localStorage.getItem(ADMIN_FLAG_KEY) === "1"; } catch (e) { return false; }
}

export default function App() {
  const [revenues, setRevenues] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState(() => (readAdminFlag() ? "admin" : "staff"));
  const [tab, setTab] = useState(() => (readAdminFlag() ? "dashboard" : "add"));
  const [addType, setAddType] = useState("thu");
  const [historyFilter, setHistoryFilter] = useState("today");
  const [historyType, setHistoryType] = useState("all");
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  const RESTRICTED_TABS = ["dashboard", "inventory", "history", "menu", "categories"];
  useEffect(() => {
    if (role !== "admin" && RESTRICTED_TABS.includes(tab)) setTab("add");
  }, [role, tab]);

  const attemptAdminLogin = () => {
    if (loginPass === ADMIN_PASS) {
      try { localStorage.setItem(ADMIN_FLAG_KEY, "1"); } catch (e) {}
      setRole("admin");
      setShowLogin(false); setLoginPass(""); setLoginError("");
      setTab("dashboard");
    } else {
      setLoginError("Sai mật khẩu, thử lại nhé.");
    }
  };
  const logoutAdmin = () => {
    try { localStorage.removeItem(ADMIN_FLAG_KEY); } catch (e) {}
    setRole("staff");
    setTab("add");
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    (async () => {
      let parsed = null;
      try {
        const { data, error } = await supabase
          .from("tra_na_data")
          .select("payload")
          .eq("id", STORAGE_KEY)
          .maybeSingle();
        if (error) throw error;
        if (data && data.payload) parsed = data.payload;
      } catch (e) {
        console.error(e);
      }
      if (parsed) {
        setRevenues(parsed.revenues || []);
        setExpenses(parsed.expenses || []);
        setIngredients(parsed.ingredients || []);
        setStockMovements(parsed.stockMovements || []);
      }
      const storedMenu = parsed && parsed.menuItems;
      setMenuItems(storedMenu && storedMenu.length ? storedMenu : DEFAULT_MENU.map((m) => ({ id: uid(), ...m })));
      const storedCategories = parsed && parsed.expenseCategories;
      setExpenseCategories(storedCategories && storedCategories.length ? storedCategories : DEFAULT_EXPENSE_CATEGORIES);
      setReady(true);
    })();
  }, []);

  const persist = async (next) => {
    try {
      const { error } = await supabase
        .from("tra_na_data")
        .upsert({ id: STORAGE_KEY, payload: next, updated_at: new Date().toISOString() });
      setSaveError(!!error);
    } catch (e) {
      setSaveError(true);
    }
  };

  // 1 đơn hàng = 1 khách, có thể gồm nhiều món — mỗi món được lưu thành 1 dòng doanh thu
  // riêng (có chung orderId) để toàn bộ logic trừ kho / thống kê theo món vẫn hoạt động bình thường.
  const addOrder = (items) => {
    if (!items || !items.length) return;
    const orderId = uid();
    const newRows = [];
    const autoMovs = [];
    items.forEach((entry) => {
      const revId = uid();
      newRows.push({ id: revId, orderId, ...entry });
      ingredients
        .map((ing) => ({ ing, y: yieldForItem(ing, entry.itemName) }))
        .filter(({ y }) => y > 0)
        .forEach(({ ing, y }) => {
          autoMovs.push({
            id: uid(), ingredientId: ing.id, date: entry.date, type: "out",
            quantity: entry.quantity / y, unitCost: 0,
            reason: "Bán hàng (tự động)", note: `${entry.quantity} ly ${entry.itemName}`,
            auto: true, sourceRevenueId: revId,
          });
        });
    });
    const nextRevenues = [...newRows, ...revenues];
    const nextMovements = autoMovs.length ? [...autoMovs, ...stockMovements] : stockMovements;
    setRevenues(nextRevenues);
    setStockMovements(nextMovements);
    persist({ revenues: nextRevenues, expenses, ingredients, stockMovements: nextMovements, menuItems, expenseCategories });
    setTab(role === "admin" ? "dashboard" : "today");
    const orderTotal = items.reduce((s, it) => s + Number(it.total), 0);
    const label = items.length === 1 ? items[0].itemName : `${items.length} món`;
    setToast(`Đã lưu đơn: ${label} · ${fmtVND(orderTotal)}`);
  };
  const addExpense = (entry) => {
    const next = [{ id: uid(), ...entry }, ...expenses];
    setExpenses(next);
    persist({ revenues, expenses: next, ingredients, stockMovements, menuItems, expenseCategories });
    setTab(role === "admin" ? "dashboard" : "today");
    setToast(`Đã lưu chi phí: ${entry.category} · ${fmtVND(entry.amount)}`);
  };
  const deleteRevenue = (id) => {
    const nextRevenues = revenues.filter((r) => r.id !== id);
    const nextMovements = stockMovements.filter((m) => m.sourceRevenueId !== id);
    setRevenues(nextRevenues);
    setStockMovements(nextMovements);
    persist({ revenues: nextRevenues, expenses, ingredients, stockMovements: nextMovements, menuItems, expenseCategories });
  };
  const deleteExpense = (id) => {
    const next = expenses.filter((e) => e.id !== id);
    setExpenses(next);
    persist({ revenues, expenses: next, ingredients, stockMovements, menuItems, expenseCategories });
  };

  const addIngredient = (ing) => {
    const next = [{ id: uid(), ...ing }, ...ingredients];
    setIngredients(next);
    persist({ revenues, expenses, ingredients: next, stockMovements, menuItems, expenseCategories });
  };
  const deleteIngredient = (id) => {
    const nextIng = ingredients.filter((i) => i.id !== id);
    const nextMov = stockMovements.filter((m) => m.ingredientId !== id);
    setIngredients(nextIng);
    setStockMovements(nextMov);
    persist({ revenues, expenses, ingredients: nextIng, stockMovements: nextMov, menuItems, expenseCategories });
  };
  const addMovement = (mov, expenseToAdd) => {
    const nextMov = [{ id: uid(), ...mov }, ...stockMovements];
    setStockMovements(nextMov);
    let nextExp = expenses;
    if (expenseToAdd) {
      nextExp = [{ id: uid(), ...expenseToAdd }, ...expenses];
      setExpenses(nextExp);
    }
    persist({ revenues, expenses: nextExp, ingredients, stockMovements: nextMov, menuItems, expenseCategories });
  };
  const deleteMovement = (id) => {
    const next = stockMovements.filter((m) => m.id !== id);
    setStockMovements(next);
    persist({ revenues, expenses, ingredients, stockMovements: next, menuItems, expenseCategories });
  };

  const addMenuItem = (item) => {
    const next = [...menuItems, { id: uid(), ...item }];
    setMenuItems(next);
    persist({ revenues, expenses, ingredients, stockMovements, menuItems: next, expenseCategories });
  };
  const updateMenuItem = (id, patch) => {
    const next = menuItems.map((m) => (m.id === id ? { ...m, ...patch } : m));
    setMenuItems(next);
    persist({ revenues, expenses, ingredients, stockMovements, menuItems: next, expenseCategories });
  };
  const deleteMenuItem = (id) => {
    const next = menuItems.filter((m) => m.id !== id);
    setMenuItems(next);
    persist({ revenues, expenses, ingredients, stockMovements, menuItems: next, expenseCategories });
  };

  const addExpenseCategory = (name) => {
    const nm = name.trim();
    if (!nm || expenseCategories.includes(nm)) return;
    const next = [...expenseCategories, nm];
    setExpenseCategories(next);
    persist({ revenues, expenses, ingredients, stockMovements, menuItems, expenseCategories: next });
  };
  const updateExpenseCategory = (oldName, newName) => {
    const nm = newName.trim();
    if (!nm || oldName === "Khác") return;
    const next = expenseCategories.map((c) => (c === oldName ? nm : c));
    setExpenseCategories(next);
    // đổi tên danh mục ở các khoản chi đã lưu để nhất quán
    const nextExpenses = expenses.map((e) => (e.category === oldName ? { ...e, category: nm } : e));
    setExpenses(nextExpenses);
    persist({ revenues, expenses: nextExpenses, ingredients, stockMovements, menuItems, expenseCategories: next });
  };
  const deleteExpenseCategory = (name) => {
    if (name === "Khác") return; // luôn giữ lại 1 mục dự phòng
    const next = expenseCategories.filter((c) => c !== name);
    setExpenseCategories(next);
    persist({ revenues, expenses, ingredients, stockMovements, menuItems, expenseCategories: next });
  };

  const today = todayISO();
  const thisMonth = monthPrefix();

  const todayRevGross = useMemo(() => revenues.filter((r) => r.date === today).reduce((s, r) => s + Number(r.total), 0), [revenues, today]);
  const todayFees = useMemo(() => revenues.filter((r) => r.date === today).reduce((s, r) => s + Number(r.feeAmount || 0), 0), [revenues, today]);
  const todayExpense = useMemo(() => expenses.filter((e) => e.date === today).reduce((s, e) => s + Number(e.amount), 0), [expenses, today]);
  const todayProfit = todayRevGross - todayFees - todayExpense;
  const todayMargin = todayRevGross > 0 ? (todayProfit / todayRevGross) * 100 : 0;
  const todayCash = useMemo(() => revenues.filter((r) => r.date === today && r.paymentMethod === "Tiền mặt").reduce((s, r) => s + Number(r.total), 0), [revenues, today]);
  const todayTransfer = useMemo(() => revenues.filter((r) => r.date === today && r.paymentMethod === "Chuyển khoản").reduce((s, r) => s + Number(r.total), 0), [revenues, today]);
  const todayRevenues = useMemo(() => revenues.filter((r) => r.date === today), [revenues, today]);
  const todayExpenses = useMemo(() => expenses.filter((e) => e.date === today), [expenses, today]);

  const monthRevGross = useMemo(() => revenues.filter((r) => r.date.startsWith(thisMonth)).reduce((s, r) => s + Number(r.total), 0), [revenues, thisMonth]);
  const monthFees = useMemo(() => revenues.filter((r) => r.date.startsWith(thisMonth)).reduce((s, r) => s + Number(r.feeAmount || 0), 0), [revenues, thisMonth]);
  const monthExpense = useMemo(() => expenses.filter((e) => e.date.startsWith(thisMonth)).reduce((s, e) => s + Number(e.amount), 0), [expenses, thisMonth]);
  const monthProfit = monthRevGross - monthFees - monthExpense;

  const channelBreakdown = useMemo(() => {
    const map = {};
    revenues.filter((r) => r.date.startsWith(thisMonth)).forEach((r) => { map[r.channel] = (map[r.channel] || 0) + Number(r.total); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [revenues, thisMonth]);

  const chartData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toLocaleDateString("en-CA");
      const rev = revenues.filter((r) => r.date === iso).reduce((s, r) => s + Number(r.total), 0);
      const exp = expenses.filter((e) => e.date === iso).reduce((s, e) => s + Number(e.amount), 0)
        + revenues.filter((r) => r.date === iso).reduce((s, r) => s + Number(r.feeAmount || 0), 0);
      days.push({ date: iso.slice(5), Thu: rev, Chi: exp });
    }
    return days;
  }, [revenues, expenses]);

  const historyEntries = useMemo(() => {
    let items = [
      ...revenues.map((r) => ({ ...r, kind: "thu" })),
      ...expenses.map((e) => ({ ...e, kind: "chi", total: e.amount })),
    ];
    if (historyType !== "all") items = items.filter((i) => i.kind === historyType);
    if (historyFilter === "today") items = items.filter((i) => i.date === today);
    else if (historyFilter === "week") {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
      const cutoff = weekAgo.toLocaleDateString("en-CA");
      items = items.filter((i) => i.date >= cutoff);
    } else if (historyFilter === "month") items = items.filter((i) => i.date.startsWith(thisMonth));
    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [revenues, expenses, historyFilter, historyType, today, thisMonth]);

  const lowStockCount = useMemo(() => ingredients.filter((ing) => stockOf(ing, stockMovements) <= Number(ing.lowStockThreshold || 0)).length, [ingredients, stockMovements]);
  const lossAlertCount = useMemo(() => ingredients.filter((ing) => lossOf(ing, stockMovements, thisMonth) > 0).length, [ingredients, stockMovements, thisMonth]);

  if (!ready) {
    return (
      <div style={{ background: C.bg, minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {loadFonts()}
        <div style={{ color: C.inkSoft, fontSize: 14 }}>Đang tải dữ liệu…</div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: 600, maxWidth: 480, margin: "0 auto", position: "relative", fontFamily: "Inter, sans-serif" }}>
      {loadFonts()}

      <div style={{ background: C.primary, padding: "20px 20px 28px", borderRadius: "0 0 24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Droplet size={20} color={C.mango} fill={C.mango} />
            <span className="ff-display" style={{ color: "#fff", fontSize: 15.5, fontWeight: 600, letterSpacing: 0.2 }}>
              TIỆM TRÀ TRÁI CÂY TRÀ NA
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {role === "admin" ? (
              <>
                <button
                  onClick={() => setTab("menu")}
                  title="Sửa menu & giá"
                  style={{
                    display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.14)",
                    border: "none", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#fff",
                  }}
                >
                  <Settings size={14} />
                  <span style={{ fontSize: 11.5, fontWeight: 500 }}>Menu</span>
                </button>
                <button
                  onClick={() => exportExcel(revenues, expenses, ingredients, stockMovements)}
                  title="Xuất Excel"
                  style={{
                    display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.14)",
                    border: "none", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#fff",
                  }}
                >
                  <Download size={14} />
                  <span style={{ fontSize: 11.5, fontWeight: 500 }}>Excel</span>
                </button>
                <button
                  onClick={logoutAdmin}
                  title="Thoát chế độ chủ tiệm"
                  style={{
                    display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.14)",
                    border: "none", borderRadius: 10, padding: "7px 9px", cursor: "pointer", color: "#fff",
                  }}
                >
                  <Unlock size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowLogin(true); setLoginError(""); setLoginPass(""); }}
                title="Đăng nhập chủ tiệm"
                style={{
                  display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.14)",
                  border: "none", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#fff",
                }}
              >
                <Lock size={14} />
                <span style={{ fontSize: 11.5, fontWeight: 500 }}>Chủ tiệm</span>
              </button>
            )}
          </div>
        </div>
        <div style={{ color: "#C9DCD3", fontSize: 12.5, marginTop: 2 }}>
          {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
        </div>
      </div>

      {showLogin && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(20,30,25,0.45)", zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setShowLogin(false)}>
          <div
            style={{ background: "#fff", borderRadius: 18, padding: 20, width: "100%", maxWidth: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Lock size={16} color={C.primary} />
                <span style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>Đăng nhập chủ tiệm</span>
              </div>
              <button onClick={() => setShowLogin(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.inkSoft }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 10 }}>
              Chỉ chủ tiệm mới xem được Tổng quan, Kho và Thống kê. Đăng nhập 1 lần, thiết bị này sẽ nhớ cho đến khi bấm thoát.
            </div>
            <input
              type="password" value={loginPass} autoFocus
              onChange={(e) => { setLoginPass(e.target.value); setLoginError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") attemptAdminLogin(); }}
              placeholder="Nhập mật khẩu"
              style={{ ...inputStyle, marginBottom: loginError ? 6 : 12 }}
            />
            {loginError && <div style={{ fontSize: 11.5, color: C.loss, marginBottom: 10 }}>{loginError}</div>}
            <SubmitBtn disabled={!loginPass} onClick={attemptAdminLogin} color={C.primary} label="Đăng nhập" />
          </div>
        </div>
      )}

      <div style={{ padding: "0 16px", marginTop: -18, paddingBottom: 90 }}>
        {toast && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, background: C.primary, color: "#fff",
            borderRadius: 12, padding: "11px 14px", marginBottom: 12, fontSize: 12.5, fontWeight: 500,
            animation: "riseIn 0.25s ease",
          }}>
            <CheckCircle2 size={16} />
            {toast}
          </div>
        )}

        {tab === "dashboard" && (
          <div style={{ animation: "riseIn 0.4s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <StatCard icon={TrendingUp} label="Doanh thu (gross)" value={fmtVND(todayRevGross)} tone="up" />
              <StatCard icon={Wallet} label="Phí kênh bán" value={fmtVND(todayFees)} tone="neutral" />
              <StatCard icon={TrendingDown} label="Chi phí khác" value={fmtVND(todayExpense)} tone="down" />
              <StatCard icon={Package} label="NL sắp hết" value={`${lowStockCount} loại`} tone={lowStockCount > 0 ? "down" : "up"} />
            </div>

            {lossAlertCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, background: "#FBEAEA", border: `1px solid ${C.loss}`,
                borderRadius: 12, padding: "10px 12px", marginBottom: 12, cursor: "pointer",
              }} onClick={() => setTab("inventory")}>
                <AlertTriangle size={16} color={C.loss} />
                <span style={{ fontSize: 12, color: C.loss, fontWeight: 500 }}>
                  {lossAlertCount} nguyên liệu có hao hụt/thất thoát tháng này — xem trong tab Kho
                </span>
              </div>
            )}

            <div style={{
              background: C.card, borderRadius: 18, padding: 16, marginBottom: 14,
              border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 4 }}>Lợi nhuận hôm nay</div>
                <div className="ff-display" style={{ fontSize: 24, fontWeight: 600, color: todayProfit >= 0 ? C.primary : C.berry }}>
                  {fmtVND(todayProfit)}
                </div>
                <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>= Doanh thu − phí kênh − chi phí</div>
                {(todayCash > 0 || todayTransfer > 0) && (
                  <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8, display: "flex", gap: 10 }}>
                    <span>💵 TM: <b className="ff-mono" style={{ color: C.ink }}>{fmtVND(todayCash)}</b></span>
                    <span>🏦 CK: <b className="ff-mono" style={{ color: C.ink }}>{fmtVND(todayTransfer)}</b></span>
                  </div>
                )}
              </div>
              <CupGauge marginPct={todayMargin} label="biên LN" />
            </div>

            <div style={{ background: C.cream, borderRadius: 16, padding: 14, marginBottom: 14, border: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, fontWeight: 600 }}>Tháng này ({thisMonth})</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: channelBreakdown.length ? 10 : 0 }}>
                <div>
                  <div style={{ color: C.inkSoft, fontSize: 10.5 }}>Doanh thu</div>
                  <div className="ff-mono" style={{ fontWeight: 600, color: C.primary }}>{fmtVND(monthRevGross)}</div>
                </div>
                <div>
                  <div style={{ color: C.inkSoft, fontSize: 10.5 }}>Phí + chi phí</div>
                  <div className="ff-mono" style={{ fontWeight: 600, color: C.berry }}>{fmtVND(monthFees + monthExpense)}</div>
                </div>
                <div>
                  <div style={{ color: C.inkSoft, fontSize: 10.5 }}>Lợi nhuận</div>
                  <div className="ff-mono" style={{ fontWeight: 600, color: monthProfit >= 0 ? C.primary : C.berry }}>{fmtVND(monthProfit)}</div>
                </div>
              </div>
              {channelBreakdown.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, color: C.inkSoft, marginBottom: 5 }}>Doanh thu theo kênh bán</div>
                  {channelBreakdown.map(([ch, amt]) => {
                    const pct = monthRevGross > 0 ? (amt / monthRevGross) * 100 : 0;
                    return (
                      <div key={ch} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{ color: C.ink }}>{ch}</span>
                          <span className="ff-mono" style={{ color: C.inkSoft }}>{fmtVND(amt)}</span>
                        </div>
                        <div style={{ height: 5, background: "#fff", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: C.primaryLight, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ background: C.card, borderRadius: 16, padding: "14px 10px 6px", border: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4, paddingLeft: 6 }}>
                14 ngày gần đây (Chi = chi phí + phí kênh)
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.berry} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={C.berry} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9.5, fill: C.inkSoft }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: C.inkSoft }} axisLine={false} tickLine={false} width={0} />
                  <Tooltip formatter={(v) => fmtVND(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                  <Area type="monotone" dataKey="Thu" stroke={C.primary} fill="url(#gRev)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Chi" stroke={C.berry} fill="url(#gExp)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === "add" && (
          <AddForm
            addType={addType} setAddType={setAddType} onAddOrder={addOrder} onAddExpense={addExpense}
            menu={menuItems} categories={expenseCategories}
            role={role} onEditCategories={() => setTab("categories")}
          />
        )}

        {tab === "today" && (
          <TodaySummary
            todayRevenues={todayRevenues} todayExpenses={todayExpenses}
            todayCash={todayCash} todayTransfer={todayTransfer} todayExpenseTotal={todayExpense}
          />
        )}

        {tab === "inventory" && (
          <InventoryTab
            ingredients={ingredients} stockMovements={stockMovements} thisMonth={thisMonth}
            onAddIngredient={addIngredient} onDeleteIngredient={deleteIngredient}
            onAddMovement={addMovement} onDeleteMovement={deleteMovement}
            menu={menuItems}
          />
        )}

        {tab === "menu" && (
          <MenuManager
            menuItems={menuItems} onAdd={addMenuItem} onUpdate={updateMenuItem} onDelete={deleteMenuItem}
            onBack={() => setTab("dashboard")}
          />
        )}

        {tab === "categories" && (
          <CategoryManager
            categories={expenseCategories} onAdd={addExpenseCategory}
            onUpdate={updateExpenseCategory} onDelete={deleteExpenseCategory}
            onBack={() => setTab("add")}
          />
        )}

        {tab === "history" && (
          <HistoryList
            entries={historyEntries} filter={historyFilter} setFilter={setHistoryFilter}
            type={historyType} setType={setHistoryType}
            onDeleteRevenue={deleteRevenue} onDeleteExpense={deleteExpense}
          />
        )}

        {saveError && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: C.berry, textAlign: "center" }}>
            Không thể lưu dữ liệu lúc này — thử lại giúp mình nhé.
          </div>
        )}
      </div>

      <div style={{
        position: "sticky", bottom: 0, left: 0, right: 0, background: C.card, borderTop: `1px solid ${C.line}`,
        display: "flex", padding: "8px 6px", gap: 4, borderRadius: "18px 18px 0 0",
      }}>
        {role === "admin" ? (
          <>
            <NavBtn icon={LayoutDashboard} label="Tổng quan" active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
            <NavBtn icon={Plus} label="Nhập liệu" active={tab === "add"} onClick={() => setTab("add")} accent />
            <NavBtn icon={Package} label="Kho" active={tab === "inventory"} onClick={() => setTab("inventory")} badge={lowStockCount > 0 ? lowStockCount : null} />
            <NavBtn icon={BarChart3} label="Thống kê" active={tab === "history"} onClick={() => setTab("history")} />
          </>
        ) : (
          <>
            <NavBtn icon={Plus} label="Nhập liệu" active={tab === "add"} onClick={() => setTab("add")} accent />
            <NavBtn icon={ClipboardList} label="Hôm nay" active={tab === "today"} onClick={() => setTab("today")} />
          </>
        )}
      </div>
    </div>
  );
}

function NavBtn({ icon: Icon, label, active, onClick, accent, badge }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      padding: "8px 2px", borderRadius: 12, border: "none", cursor: "pointer", position: "relative",
      background: active ? (accent ? C.mango : C.cream) : "transparent",
    }}>
      <div style={{ position: "relative" }}>
        <Icon size={17} color={active ? (accent ? "#fff" : C.primary) : C.inkSoft} />
        {badge && (
          <span style={{
            position: "absolute", top: -6, right: -8, background: C.berry, color: "#fff",
            fontSize: 8.5, fontWeight: 700, borderRadius: 8, padding: "1px 4px", lineHeight: 1.3,
          }}>{badge}</span>
        )}
      </div>
      <span style={{ fontSize: 10, color: active ? (accent ? "#fff" : C.primary) : C.inkSoft, fontWeight: 500 }}>{label}</span>
    </button>
  );
}

function AddForm({ addType, setAddType, onAddOrder, onAddExpense, menu, categories, role, onEditCategories }) {
  const menuOptions = [...menu, MENU_KHAC];

  // ---- thông tin chung của cả đơn (1 đơn = 1 khách, có thể nhiều món) ----
  const [date, setDate] = useState(todayISO());
  const [channel, setChannel] = useState(CHANNELS[0].key);
  const [feePercent, setFeePercent] = useState(CHANNELS[0].defaultFee);
  const [markupAmount, setMarkupAmount] = useState(CHANNELS[0].defaultMarkupAmount);
  const [paymentMethod, setPaymentMethod] = useState(CHANNELS[0].key === "Tại quầy" ? "Tiền mặt" : "Chuyển khoản");

  // ---- món đang thêm vào đơn ----
  const [item, setItem] = useState(menuOptions[0].name);
  const [customItem, setCustomItem] = useState("");
  const [qty, setQty] = useState(1);
  const [basePrice, setBasePrice] = useState(menuOptions[0].price ?? "");
  const [price, setPrice] = useState(menuOptions[0].price ?? "");
  const [isPromo, setIsPromo] = useState(false);
  const [promoAmount, setPromoAmount] = useState(5000);

  const [cartItems, setCartItems] = useState([]); // các món đã thêm vào đơn, chưa lưu

  const recomputePrice = (base, markupAmt, promoOn, promoAmt) => {
    if (base == null || base === "") return;
    let p = Number(base) + (Number(markupAmt) || 0);
    if (promoOn) p -= Number(promoAmt) || 0;
    setPrice(Math.max(0, p));
  };

  const [category, setCategory] = useState(categories[0]);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");

  const itemTotal = (Number(qty) || 0) * (Number(price) || 0);
  const canAddItem = Number(qty) > 0 && Number(price) > 0 && (item !== "Khác" || customItem.trim());
  const canSubmitExpense = Number(amount) > 0;

  const cartGross = cartItems.reduce((s, c) => s + c.total, 0);
  const cartFee = (cartGross * (Number(feePercent) || 0)) / 100;
  const cartNet = cartGross - cartFee;

  const addToCart = () => {
    if (!canAddItem) return;
    const nm = item === "Khác" ? customItem.trim() : item;
    setCartItems((prev) => [...prev, {
      id: uid(), itemName: nm, quantity: Number(qty),
      basePrice: basePrice === "" ? null : Number(basePrice),
      markupAmount: Number(markupAmount) || 0,
      isPromo, promoAmount: isPromo ? Number(promoAmount) || 0 : 0,
      price: Number(price), total: itemTotal,
    }]);
    const preset = menuOptions[0];
    setItem(preset.name); setCustomItem(""); setQty(1); setIsPromo(false);
    const nb = preset.price ?? "";
    setBasePrice(nb);
    recomputePrice(nb, markupAmount, false, promoAmount);
  };
  const removeFromCart = (id) => setCartItems((prev) => prev.filter((c) => c.id !== id));

  const resetOrder = () => {
    setCartItems([]);
    const preset = menuOptions[0];
    setItem(preset.name); setCustomItem(""); setQty(1); setIsPromo(false);
    const nb = preset.price ?? "";
    setBasePrice(nb);
    recomputePrice(nb, markupAmount, false, promoAmount);
  };
  const resetExpense = () => { setAmount(""); setDesc(""); };

  const submitOrder = () => {
    if (!cartItems.length) return;
    const rows = cartItems.map((c) => {
      const feeAmt = (c.total * (Number(feePercent) || 0)) / 100;
      return {
        date, itemName: c.itemName, quantity: c.quantity, unitPrice: c.price, total: c.total,
        basePrice: c.basePrice, channel, feePercent: Number(feePercent) || 0,
        feeAmount: feeAmt, netAmount: c.total - feeAmt,
        markupAmount: c.markupAmount, isPromo: c.isPromo, promoAmount: c.promoAmount,
        paymentMethod, note: "",
      };
    });
    onAddOrder(rows);
    resetOrder();
  };
  const submitExpense = () => {
    if (!canSubmitExpense) return;
    onAddExpense({ date, category, amount: Number(amount), description: desc.trim() });
    resetExpense();
  };

  return (
    <div style={{ animation: "riseIn 0.35s ease" }}>
      <div style={{ display: "flex", background: C.card, borderRadius: 14, padding: 4, border: `1px solid ${C.line}`, marginBottom: 14 }}>
        <button onClick={() => setAddType("thu")} style={{
          flex: 1, padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer",
          background: addType === "thu" ? C.primary : "transparent",
          color: addType === "thu" ? "#fff" : C.inkSoft, fontWeight: 600, fontSize: 13.5,
        }}>+ Đơn hàng</button>
        <button onClick={() => setAddType("chi")} style={{
          flex: 1, padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer",
          background: addType === "chi" ? C.berry : "transparent",
          color: addType === "chi" ? "#fff" : C.inkSoft, fontWeight: 600, fontSize: 13.5,
        }}>+ Chi phí</button>
      </div>

      {addType === "thu" ? (
        <>
          <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}`, marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <ShoppingCart size={13} /> Thông tin đơn hàng
            </div>
            <Field label="Ngày">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Kênh bán">
              <select value={channel} onChange={(e) => {
                const ch = e.target.value;
                setChannel(ch);
                const preset = CHANNELS.find((c) => c.key === ch);
                setFeePercent(preset ? preset.defaultFee : 0);
                setMarkupAmount(preset ? preset.defaultMarkupAmount : 0);
                recomputePrice(basePrice, preset ? preset.defaultMarkupAmount : 0, isPromo, promoAmount);
                setPaymentMethod(ch === "Tại quầy" ? "Tiền mặt" : "Chuyển khoản");
              }} style={inputStyle}>
                {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
              </select>
            </Field>
            <Field label="Phương thức thu tiền">
              <div style={{ display: "flex", gap: 8 }}>
                {PAYMENT_METHODS.map((pm) => (
                  <button key={pm} type="button" onClick={() => setPaymentMethod(pm)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 10, border: `1px solid ${paymentMethod === pm ? C.primary : C.line}`,
                    background: paymentMethod === pm ? C.primary : "#fff", color: paymentMethod === pm ? "#fff" : C.inkSoft,
                    fontWeight: 600, fontSize: 12.5, cursor: "pointer",
                  }}>{pm}</button>
                ))}
              </div>
            </Field>
            {channel !== "Tại quầy" && (
              <div style={{ display: "flex", gap: 10 }}>
                <Field label="Phí kênh (%)" style={{ flex: 1 }}>
                  <input type="number" min="0" max="100" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Giá cao hơn giá quầy (đ)" style={{ flex: 1.2 }}>
                  <input type="number" min="0" value={markupAmount} onChange={(e) => {
                    setMarkupAmount(e.target.value);
                    recomputePrice(basePrice, e.target.value, isPromo, promoAmount);
                  }} placeholder="VD: 3000" style={{ ...inputStyle, marginBottom: 0 }} />
                </Field>
              </div>
            )}
          </div>

          <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}`, marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 8, fontWeight: 600 }}>Thêm món vào đơn</div>
            <Field label="Món">
              <select value={item} onChange={(e) => {
                const name = e.target.value;
                setItem(name);
                const preset = menuOptions.find((m) => m.name === name);
                if (preset && preset.price != null) {
                  setBasePrice(preset.price);
                  recomputePrice(preset.price, markupAmount, isPromo, promoAmount);
                } else {
                  setBasePrice("");
                  setPrice("");
                }
              }} style={inputStyle}>
                {menuOptions.map((m) => <option key={m.id || m.name} value={m.name}>{m.name}{m.price ? ` — ${fmtVND(m.price)} (giá quầy)` : ""}</option>)}
              </select>
            </Field>
            {item === "Khác" && (
              <Field label="Tên món">
                <input value={customItem} onChange={(e) => setCustomItem(e.target.value)} placeholder="Nhập tên món" style={inputStyle} />
              </Field>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.ink, marginBottom: isPromo ? 8 : 12, fontWeight: 500 }}>
              <input type="checkbox" checked={isPromo} onChange={(e) => {
                setIsPromo(e.target.checked);
                recomputePrice(basePrice, markupAmount, e.target.checked, promoAmount);
              }} />
              Món này đang khuyến mãi
            </label>
            {isPromo && (
              <Field label="Giảm giá khuyến mãi (đ)">
                <input type="number" min="0" value={promoAmount} onChange={(e) => {
                  setPromoAmount(e.target.value);
                  recomputePrice(basePrice, markupAmount, true, e.target.value);
                }} placeholder="VD: 5000" style={inputStyle} />
              </Field>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Số lượng (ly)" style={{ flex: 1 }}>
                <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Đơn giá (đ) — tự gợi ý, chỉnh được" style={{ flex: 1.4 }}>
                <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="VD: 20000" style={inputStyle} />
              </Field>
            </div>
            {basePrice !== "" && basePrice !== Number(price) && (
              <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: -8, marginBottom: 12 }}>
                Giá tại quầy: {fmtVND(basePrice)} · giá gợi ý đã tính chênh lệch kênh{isPromo ? " + khuyến mãi" : ""}, bạn chỉnh tay lại thoải mái nếu khác.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: C.inkSoft }}>Thành tiền món này: <b style={{ color: C.ink }}>{fmtVND(itemTotal)}</b></span>
            </div>
            <SubmitBtn disabled={!canAddItem} onClick={addToCart} color={C.primaryLight} label="+ Thêm vào đơn" />
          </div>

          <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 8, fontWeight: 600 }}>
              Món trong đơn {cartItems.length > 0 ? `(${cartItems.length})` : ""}
            </div>
            {cartItems.length === 0 ? (
              <div style={{ fontSize: 12, color: C.inkSoft, padding: "6px 0 14px" }}>Chưa có món nào — thêm món ở trên.</div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {cartItems.map((c) => (
                  <div key={c.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontSize: 12.5,
                  }}>
                    <div>
                      <span style={{ color: C.ink, fontWeight: 600 }}>{c.itemName}</span>
                      <span style={{ color: C.inkSoft }}> × {c.quantity}{c.isPromo ? " · KM" : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="ff-mono" style={{ color: C.ink, fontWeight: 600 }}>{fmtVND(c.total)}</span>
                      <button onClick={() => removeFromCart(c.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.inkSoft, padding: 2 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cartItems.length > 0 && (
              <div style={{ background: C.cream, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.inkSoft }}>Tổng tiền đơn</span>
                  <span className="ff-mono" style={{ color: C.ink, fontWeight: 600 }}>{fmtVND(cartGross)}</span>
                </div>
                {cartFee > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.inkSoft }}>Phí kênh ({feePercent}%)</span>
                    <span className="ff-mono" style={{ color: C.berry, fontWeight: 600 }}>−{fmtVND(cartFee)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ color: C.inkSoft, fontWeight: 600 }}>Thực nhận</span>
                  <span className="ff-mono" style={{ color: C.primary, fontWeight: 700 }}>{fmtVND(cartNet)}</span>
                </div>
              </div>
            )}
            <SubmitBtn disabled={cartItems.length === 0} onClick={submitOrder} color={C.primary} label="Lưu đơn hàng" />
          </div>
        </>
      ) : (
        <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}` }}>
          <Field label="Ngày">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Danh mục">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {role === "admin" && (
            <button
              onClick={onEditCategories}
              style={{
                display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent",
                color: C.primary, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                padding: 0, marginTop: -8, marginBottom: 12,
              }}
            >
              <Pencil size={12} /> Sửa danh mục chi phí
            </button>
          )}
          <Field label="Số tiền (đ)">
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="VD: 150000" style={inputStyle} />
          </Field>
          <Field label="Mô tả (tuỳ chọn)">
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="VD: mua đường, xăng xe giao hàng..." style={inputStyle} />
          </Field>
          <div style={{ marginBottom: 12 }} />
          <SubmitBtn disabled={!canSubmitExpense} onClick={submitExpense} color={C.berry} label="Lưu chi phí" />
        </div>
      )}
    </div>
  );
}

function InventoryTab({ ingredients, stockMovements, thisMonth, onAddIngredient, onDeleteIngredient, onAddMovement, onDeleteMovement, menu }) {
  const [view, setView] = useState("list"); // list | newIngredient | movement
  const [movType, setMovType] = useState("in"); // in | out | check

  const [name, setName] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [customUnit, setCustomUnit] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [threshold, setThreshold] = useState("");
  const [linkedItems, setLinkedItems] = useState([]);
  const [itemYields, setItemYields] = useState({}); // { itemName: "20" } — định mức riêng cho từng món
  const [yieldPerUnit, setYieldPerUnit] = useState(""); // dùng khi tick "dùng chung"
  const [shared, setShared] = useState(false);
  const toggleLinkedItem = (itemName) => {
    setLinkedItems((prev) => prev.includes(itemName) ? prev.filter((n) => n !== itemName) : [...prev, itemName]);
    setItemYields((prev) => {
      if (prev[itemName] !== undefined) {
        const next = { ...prev }; delete next[itemName]; return next;
      }
      return { ...prev, [itemName]: "" };
    });
  };

  const [movIngredientId, setMovIngredientId] = useState(ingredients[0]?.id || "");
  const [movDate, setMovDate] = useState(todayISO());
  const [movQty, setMovQty] = useState("");
  const [movCost, setMovCost] = useState("");
  const [movReason, setMovReason] = useState("Pha chế bán hàng");
  const [movNote, setMovNote] = useState("");
  const [autoExpense, setAutoExpense] = useState(true);
  const [checkActual, setCheckActual] = useState("");

  useEffect(() => {
    if (!movIngredientId && ingredients.length) setMovIngredientId(ingredients[0].id);
  }, [ingredients, movIngredientId]);

  const resolvedUnit = unit === "khác" ? (customUnit.trim() || "khác") : unit;
  const canSubmitIngredient = name.trim() && (unit !== "khác" || customUnit.trim());

  const submitIngredient = () => {
    if (!canSubmitIngredient) return;
    onAddIngredient({
      name: name.trim(), unit: resolvedUnit, initialStock: Number(initialStock) || 0,
      lowStockThreshold: Number(threshold) || 0,
      recipeLinks: shared ? [] : linkedItems.map((nm) => ({ itemName: nm, yieldPerUnit: Number(itemYields[nm]) || 0 })),
      yieldPerUnit: Number(yieldPerUnit) || 0,
      shared,
    });
    setName(""); setInitialStock(""); setThreshold(""); setLinkedItems([]); setItemYields({}); setYieldPerUnit(""); setShared(false);
    setUnit(UNITS[0]); setCustomUnit("");
    setView("list");
  };

  const ing = ingredients.find((i) => i.id === movIngredientId);
  const theoreticalStock = ing ? stockOf(ing, stockMovements) : 0;
  const diff = ing ? theoreticalStock - (Number(checkActual) || 0) : 0;

  const submitMovement = () => {
    if (!movIngredientId) return;
    if (movType === "check") {
      if (checkActual === "") return;
      if (Math.abs(diff) < 1e-9) { setCheckActual(""); setView("list"); return; }
      const isLoss = diff > 0;
      onAddMovement({
        ingredientId: movIngredientId, date: movDate, type: isLoss ? "out" : "in",
        quantity: Math.abs(diff), unitCost: 0,
        reason: isLoss ? "Kiểm kho - hao hụt" : "Kiểm kho - phát hiện dư",
        note: `Lý thuyết ${fmtNum(theoreticalStock)}, thực tế ${fmtNum(Number(checkActual))}${movNote ? " · " + movNote : ""}`,
      });
      setCheckActual(""); setMovNote(""); setView("list");
      return;
    }
    if (!(Number(movQty) > 0)) return;
    let expenseToAdd = null;
    if (movType === "in" && autoExpense && Number(movCost) > 0) {
      expenseToAdd = {
        date: movDate, category: "Nguyên liệu", amount: Number(movCost) * Number(movQty),
        description: `Nhập kho: ${ing?.name} x${movQty} ${ing?.unit}`,
      };
    }
    onAddMovement({
      ingredientId: movIngredientId, date: movDate, type: movType,
      quantity: Number(movQty), unitCost: movType === "in" ? Number(movCost) || 0 : 0,
      reason: movType === "in" ? "Nhập hàng" : movReason,
      note: movNote,
    }, expenseToAdd);
    setMovQty(""); setMovCost(""); setMovNote(""); setView("list");
  };

  if (view === "newIngredient") {
    return (
      <div style={{ animation: "riseIn 0.3s ease" }}>
        <BackHeader title="Thêm nguyên liệu" onBack={() => setView("list")} />
        <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}` }}>
          <Field label="Tên nguyên liệu">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Khóm (dứa), trà đen, đường..." style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Đơn vị" style={{ flex: 1 }}>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Tồn kho hiện có" style={{ flex: 1 }}>
              <input type="number" min="0" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} placeholder="0" style={inputStyle} />
            </Field>
          </div>
          {unit === "khác" && (
            <Field label="Đơn vị cụ thể là gì?">
              <input value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="VD: ly, phần, miếng, bó..." style={inputStyle} />
            </Field>
          )}
          <Field label="Ngưỡng cảnh báo sắp hết (tuỳ chọn)">
            <input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="VD: 2" style={inputStyle} />
          </Field>

          <div style={{ background: C.cream, borderRadius: 12, padding: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 11.5, color: C.inkSoft, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <Link2 size={13} /> Liên kết món (để tự trừ kho khi bán) — tuỳ chọn
            </div>

            <label style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink,
              background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px",
              marginBottom: 10, cursor: "pointer",
            }}>
              <input type="checkbox" checked={shared} onChange={(e) => { setShared(e.target.checked); if (e.target.checked) setLinkedItems([]); }} />
              Dùng chung cho tất cả các món (VD: trà nền, đường, đá...)
            </label>

            {!shared && (
              <Field label={`Chọn các món dùng nguyên liệu này — mỗi món có định mức riêng${linkedItems.length ? ` (đã chọn ${linkedItems.length})` : ""}`}>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto",
                  background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 6,
                }}>
                  {menu.map((m) => {
                    const checked = linkedItems.includes(m.name);
                    return (
                      <div key={m.id || m.name}>
                        <label style={{
                          display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink,
                          padding: "6px 6px", borderRadius: 7, cursor: "pointer",
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleLinkedItem(m.name)} />
                          {m.name}
                        </label>
                        {checked && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 6px 6px 32px" }}>
                            <span style={{ fontSize: 11, color: C.inkSoft, whiteSpace: "nowrap" }}>1 {unit} pha được</span>
                            <input
                              type="number" min="0"
                              value={itemYields[m.name] ?? ""}
                              onChange={(e) => setItemYields((prev) => ({ ...prev, [m.name]: e.target.value }))}
                              placeholder="VD: 20" style={{ ...inputStyle, padding: "6px 8px", fontSize: 12.5 }}
                            />
                            <span style={{ fontSize: 11, color: C.inkSoft, whiteSpace: "nowrap" }}>ly {m.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 6 }}>
                  Mỗi món dùng nguyên liệu này có thể hao hụt khác nhau (VD: món nguyên chất dùng nhiều hơn món pha trộn), nên nhập định mức riêng cho từng món.
                </div>
              </Field>
            )}

            {shared && (
              <>
                <Field label={`1 ${unit} pha được bao nhiêu ly (bất kỳ món nào)?`} style={{ marginBottom: 0 }}>
                  <input type="number" min="0" value={yieldPerUnit} onChange={(e) => setYieldPerUnit(e.target.value)} placeholder="VD: 20" style={inputStyle} />
                </Field>
                <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 6 }}>
                  Mỗi ly bán ra của bất kỳ món nào cũng sẽ trừ kho nguyên liệu này theo định mức trên.
                </div>
              </>
            )}
          </div>
          <div style={{ marginBottom: 12 }} />
          <SubmitBtn disabled={!canSubmitIngredient} onClick={submitIngredient} color={C.primary} label="Thêm nguyên liệu" />
        </div>
      </div>
    );
  }

  if (view === "movement") {
    if (ingredients.length === 0) {
      return (
        <div style={{ animation: "riseIn 0.3s ease" }}>
          <BackHeader title="Nhập / Xuất / Kiểm kho" onBack={() => setView("list")} />
          <EmptyHint text="Bạn cần thêm nguyên liệu trước khi ghi nhập/xuất kho." />
        </div>
      );
    }
    return (
      <div style={{ animation: "riseIn 0.3s ease" }}>
        <BackHeader title="Nhập / Xuất / Kiểm kho" onBack={() => setView("list")} />
        <div style={{ display: "flex", background: C.card, borderRadius: 14, padding: 4, border: `1px solid ${C.line}`, marginBottom: 12 }}>
          <button onClick={() => setMovType("in")} style={{
            flex: 1, padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: movType === "in" ? C.primary : "transparent",
            color: movType === "in" ? "#fff" : C.inkSoft, fontWeight: 600, fontSize: 12.5,
          }}>↓ Nhập</button>
          <button onClick={() => setMovType("out")} style={{
            flex: 1, padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: movType === "out" ? C.warn : "transparent",
            color: movType === "out" ? "#fff" : C.inkSoft, fontWeight: 600, fontSize: 12.5,
          }}>↑ Xuất</button>
          <button onClick={() => setMovType("check")} style={{
            flex: 1, padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer",
            background: movType === "check" ? C.loss : "transparent",
            color: movType === "check" ? "#fff" : C.inkSoft, fontWeight: 600, fontSize: 12.5,
          }}>⚖ Kiểm kho</button>
        </div>
        <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}` }}>
          <Field label="Nguyên liệu">
            <select value={movIngredientId} onChange={(e) => { setMovIngredientId(e.target.value); setCheckActual(""); }} style={inputStyle}>
              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </Field>
          {ing && (
            <div style={{ fontSize: 11, color: C.inkSoft, marginTop: -8, marginBottom: 12 }}>
              Tồn lý thuyết hiện tại: <b>{fmtNum(theoreticalStock)} {ing.unit}</b>
              {recipeSummaryText(ing, stockMovements) && <> · {recipeSummaryText(ing, stockMovements)}</>}
            </div>
          )}
          <Field label="Ngày">
            <input type="date" value={movDate} onChange={(e) => setMovDate(e.target.value)} style={inputStyle} />
          </Field>

          {movType === "check" ? (
            <>
              <Field label={`Số lượng thực tế đo/đếm được (${ing?.unit || ""})`}>
                <input type="number" min="0" value={checkActual} onChange={(e) => setCheckActual(e.target.value)} placeholder="VD: 0" style={inputStyle} />
              </Field>
              {checkActual !== "" && (
                <div style={{
                  borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12,
                  background: Math.abs(diff) < 1e-9 ? C.cream : (diff > 0 ? "#FBEAEA" : "#EAF3EF"),
                  color: Math.abs(diff) < 1e-9 ? C.inkSoft : (diff > 0 ? C.loss : C.primary), fontWeight: 500,
                }}>
                  {Math.abs(diff) < 1e-9
                    ? "Khớp với lý thuyết — không cần điều chỉnh."
                    : diff > 0
                      ? `Hao hụt / thất thoát: ${fmtNum(diff)} ${ing?.unit}${ing && avgYield(ing) > 0 ? ` (~${Math.round(diff * avgYield(ing))} ly)` : ""}`
                      : `Phát hiện dư so với sổ sách: ${fmtNum(Math.abs(diff))} ${ing?.unit}`}
                </div>
              )}
              <Field label="Ghi chú (tuỳ chọn)">
                <input value={movNote} onChange={(e) => setMovNote(e.target.value)} placeholder="VD: kiểm cuối ca tối..." style={inputStyle} />
              </Field>
              <SubmitBtn disabled={checkActual === ""} onClick={submitMovement} color={C.loss} label="Ghi nhận kiểm kho" />
            </>
          ) : (
            <>
              <Field label={`Số lượng (${ing?.unit || ""})`}>
                <input type="number" min="0" value={movQty} onChange={(e) => setMovQty(e.target.value)} style={inputStyle} />
              </Field>
              {movType === "in" ? (
                <>
                  <Field label="Đơn giá nhập (đ/đơn vị, tuỳ chọn)">
                    <input type="number" min="0" value={movCost} onChange={(e) => setMovCost(e.target.value)} placeholder="VD: 45000" style={inputStyle} />
                  </Field>
                  {Number(movCost) > 0 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.inkSoft, marginBottom: 12 }}>
                      <input type="checkbox" checked={autoExpense} onChange={(e) => setAutoExpense(e.target.checked)} />
                      Tự động thêm {fmtVND((Number(movCost) || 0) * (Number(movQty) || 0))} vào chi phí "Nguyên liệu"
                    </label>
                  )}
                  <Field label="Ghi chú (tuỳ chọn)">
                    <input value={movNote} onChange={(e) => setMovNote(e.target.value)} placeholder="VD: mua tại chợ, nhà cung cấp A..." style={inputStyle} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Lý do">
                    <select value={movReason} onChange={(e) => setMovReason(e.target.value)} style={inputStyle}>
                      <option>Pha chế bán hàng</option>
                      <option>Hao hụt / hỏng</option>
                      <option>Khác</option>
                    </select>
                  </Field>
                  <Field label="Ghi chú (tuỳ chọn)">
                    <input value={movNote} onChange={(e) => setMovNote(e.target.value)} style={inputStyle} />
                  </Field>
                </>
              )}
              <SubmitBtn disabled={!(Number(movQty) > 0)} onClick={submitMovement} color={movType === "in" ? C.primary : C.warn} label={movType === "in" ? "Ghi nhập kho" : "Ghi xuất kho"} />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: "riseIn 0.35s ease" }}>
      <div style={{ fontSize: 11, color: C.inkSoft, background: C.cream, border: `1px dashed ${C.line}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
        Bán hàng có liên kết định mức sẽ tự trừ kho. Dùng <b>Kiểm kho</b> khi đếm/cân lại thực tế để phát hiện hao hụt, thất thoát.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setView("movement")} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "10px 0", borderRadius: 12, border: "none", background: C.primary, color: "#fff",
          fontWeight: 600, fontSize: 12.5, cursor: "pointer",
        }}>
          <ArrowDownCircle size={15} /> Nhập/Xuất/Kiểm kho
        </button>
        <button onClick={() => setView("newIngredient")} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "10px 0", borderRadius: 12, border: `1px solid ${C.line}`, background: "#fff", color: C.ink,
          fontWeight: 600, fontSize: 12.5, cursor: "pointer",
        }}>
          <Plus size={15} /> Nguyên liệu mới
        </button>
      </div>

      {ingredients.length === 0 ? (
        <EmptyHint text="Chưa có nguyên liệu nào. Bấm 'Nguyên liệu mới' để bắt đầu theo dõi tồn kho." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ingredients.map((ing2) => {
            const stock = stockOf(ing2, stockMovements);
            const low = stock <= Number(ing2.lowStockThreshold || 0);
            const lossMonth = lossOf(ing2, stockMovements, thisMonth);
            return (
              <div key={ing2.id} style={{
                background: C.card, borderRadius: 14, padding: "12px 14px",
                border: `1px solid ${low ? C.warn : C.line}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{ing2.name}</span>
                      {low && <AlertTriangle size={13} color={C.warn} />}
                    </div>
                    <div style={{ fontSize: 11, color: C.inkSoft }}>
                      {recipeSummaryText(ing2, stockMovements) || `Ngưỡng cảnh báo: ${fmtNum(ing2.lowStockThreshold)} ${ing2.unit}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="ff-mono" style={{ fontSize: 16, fontWeight: 700, color: low ? C.warn : C.primary }}>{fmtNum(stock)}</div>
                    <div style={{ fontSize: 10.5, color: C.inkSoft }}>{ing2.unit}</div>
                  </div>
                  <button onClick={() => onDeleteIngredient(ing2.id)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                    <Trash2 size={14} color={C.inkSoft} />
                  </button>
                </div>
                {lossMonth > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.loss, background: "#FBEAEA", borderRadius: 8, padding: "5px 8px", display: "flex", alignItems: "center", gap: 5 }}>
                    <AlertTriangle size={12} />
                    Hao hụt tháng này: {fmtNum(lossMonth)} {ing2.unit}{avgYield(ing2) > 0 ? ` (~${Math.round(lossMonth * avgYield(ing2))} ly)` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {stockMovements.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 8 }}>Nhật ký kho gần đây</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stockMovements.slice(0, 10).map((m) => {
              const ing3 = ingredients.find((i) => i.id === m.ingredientId);
              const isLossEntry = LOSS_REASONS.includes(m.reason);
              const color = isLossEntry ? C.loss : m.type === "in" ? C.primary : C.warn;
              return (
                <div key={m.id} style={{
                  background: isLossEntry ? "#FBEAEA" : C.card, borderRadius: 12, padding: "9px 12px",
                  border: `1px solid ${isLossEntry ? C.loss : C.line}`, display: "flex", alignItems: "center", gap: 8,
                }}>
                  {m.type === "in" ? <ArrowDownCircle size={15} color={color} /> : isLossEntry ? <AlertTriangle size={15} color={color} /> : <ArrowUpCircle size={15} color={color} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ing3 ? ing3.name : "?"} <span style={{ fontWeight: 400, color: C.inkSoft }}>· {m.reason}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: C.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.date}{m.note ? ` · ${m.note}` : ""}</div>
                  </div>
                  <div className="ff-mono" style={{ fontSize: 12.5, fontWeight: 700, color }}>
                    {m.type === "in" ? "+" : "−"}{fmtNum(m.quantity)} {ing3?.unit}
                  </div>
                  <button onClick={() => onDeleteMovement(m.id)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2 }}>
                    <Trash2 size={12} color={C.inkSoft} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuManager({ menuItems, onAdd, onUpdate, onDelete, onBack }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const canAdd = name.trim() && Number(price) > 0;
  const submitAdd = () => {
    if (!canAdd) return;
    onAdd({ name: name.trim(), price: Number(price) });
    setName(""); setPrice("");
  };

  const startEdit = (m) => { setEditingId(m.id); setEditName(m.name); setEditPrice(m.price); };
  const canSaveEdit = editName.trim() && Number(editPrice) > 0;
  const saveEdit = () => {
    if (!canSaveEdit) return;
    onUpdate(editingId, { name: editName.trim(), price: Number(editPrice) });
    setEditingId(null);
  };

  return (
    <div style={{ animation: "riseIn 0.3s ease" }}>
      <BackHeader title="Menu & bảng giá" onBack={onBack} />
      <div style={{ fontSize: 11, color: C.inkSoft, background: C.cream, border: `1px dashed ${C.line}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
        Sửa tên món hoặc giá ở đây sẽ áp dụng cho các lần nhập doanh thu tiếp theo — không đổi lại các đơn đã lưu trước đó.
      </div>

      <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}`, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, marginBottom: 10 }}>Thêm món mới</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên món" style={{ ...inputStyle, flex: 1.4 }} />
          <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Giá (đ)" style={{ ...inputStyle, flex: 1 }} />
        </div>
        <SubmitBtn disabled={!canAdd} onClick={submitAdd} color={C.primary} label="Thêm vào menu" />
      </div>

      {menuItems.length === 0 ? (
        <EmptyHint text="Menu đang trống — thêm món đầu tiên ở trên." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {menuItems.map((m) => (
            <div key={m.id} style={{ background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
              {editingId === m.id ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, flex: 1.4 }} />
                  <input type="number" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={saveEdit} disabled={!canSaveEdit} style={{
                    border: "none", background: canSaveEdit ? C.primary : C.line, color: "#fff", borderRadius: 8,
                    padding: "9px 12px", fontSize: 12, fontWeight: 600, cursor: canSaveEdit ? "pointer" : "not-allowed", flexShrink: 0,
                  }}>Lưu</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                    <div className="ff-mono" style={{ fontSize: 12, color: C.inkSoft }}>{fmtVND(m.price)}</div>
                  </div>
                  <button onClick={() => startEdit(m)} style={{
                    display: "flex", alignItems: "center", gap: 4, border: `1px solid ${C.line}`, background: "#fff",
                    borderRadius: 8, padding: "6px 10px", fontSize: 11.5, color: C.ink, cursor: "pointer", flexShrink: 0,
                  }}>
                    <Pencil size={12} /> Sửa
                  </button>
                  <button onClick={() => onDelete(m.id)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                    <Trash2 size={15} color={C.inkSoft} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryManager({ categories, onAdd, onUpdate, onDelete, onBack }) {
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(null);
  const [editValue, setEditValue] = useState("");

  const canAdd = name.trim() && !categories.includes(name.trim());
  const submitAdd = () => {
    if (!canAdd) return;
    onAdd(name.trim());
    setName("");
  };

  const startEdit = (c) => { setEditingName(c); setEditValue(c); };
  const canSaveEdit = editValue.trim() && !(categories.includes(editValue.trim()) && editValue.trim() !== editingName);
  const saveEdit = () => {
    if (!canSaveEdit) return;
    onUpdate(editingName, editValue.trim());
    setEditingName(null);
  };

  return (
    <div style={{ animation: "riseIn 0.3s ease" }}>
      <BackHeader title="Danh mục chi phí" onBack={onBack} />
      <div style={{ fontSize: 11, color: C.inkSoft, background: C.cream, border: `1px dashed ${C.line}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
        Thêm, sửa hoặc xoá danh mục dùng khi nhập chi phí. Mục "Khác" luôn được giữ lại làm mục dự phòng.
      </div>

      <div style={{ background: C.card, borderRadius: 16, padding: 16, border: `1px solid ${C.line}`, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, marginBottom: 10 }}>Thêm danh mục mới</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Sửa chữa, bảo trì" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <button onClick={submitAdd} disabled={!canAdd} style={{
            border: "none", background: canAdd ? C.primary : C.line, color: "#fff", borderRadius: 10,
            padding: "0 16px", fontSize: 12.5, fontWeight: 600, cursor: canAdd ? "pointer" : "not-allowed", flexShrink: 0,
          }}>Thêm</button>
        </div>
      </div>

      {categories.length === 0 ? (
        <EmptyHint text="Chưa có danh mục nào." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categories.map((c) => (
            <div key={c} style={{ background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
              {editingName === c ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={editValue} onChange={(e) => setEditValue(e.target.value)} style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
                  <button onClick={saveEdit} disabled={!canSaveEdit} style={{
                    border: "none", background: canSaveEdit ? C.primary : C.line, color: "#fff", borderRadius: 8,
                    padding: "9px 12px", fontSize: 12, fontWeight: 600, cursor: canSaveEdit ? "pointer" : "not-allowed", flexShrink: 0,
                  }}>Lưu</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c}
                  </div>
                  {c !== "Khác" && (
                    <>
                      <button onClick={() => startEdit(c)} style={{
                        display: "flex", alignItems: "center", gap: 4, border: `1px solid ${C.line}`, background: "#fff",
                        borderRadius: 8, padding: "6px 10px", fontSize: 11.5, color: C.ink, cursor: "pointer", flexShrink: 0,
                      }}>
                        <Pencil size={12} /> Sửa
                      </button>
                      <button onClick={() => onDelete(c)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                        <Trash2 size={15} color={C.inkSoft} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BackHeader({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <button onClick={onBack} style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: C.inkSoft, cursor: "pointer" }}>← Quay lại</button>
      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{title}</span>
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div style={{ textAlign: "center", color: C.inkSoft, fontSize: 12.5, padding: "26px 16px", background: C.cream, borderRadius: 14, border: `1px dashed ${C.line}` }}>{text}</div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label style={{ fontSize: 11.5, color: C.inkSoft, fontWeight: 500, display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.line}`,
  fontSize: 14, color: C.ink, background: "#fff", outline: "none",
};

function SubmitBtn({ disabled, onClick, color, label }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "11px 0", borderRadius: 12, border: "none",
      background: disabled ? C.line : color, color: disabled ? C.inkSoft : "#fff",
      fontWeight: 600, fontSize: 14.5, cursor: disabled ? "not-allowed" : "pointer",
    }}>
      {label}
    </button>
  );
}

function HistoryList({ entries, filter, setFilter, type, setType, onDeleteRevenue, onDeleteExpense }) {
  const totalIn = entries.filter((e) => e.kind === "thu").reduce((s, e) => s + Number(e.total), 0);
  const totalOut = entries.filter((e) => e.kind === "chi").reduce((s, e) => s + Number(e.total), 0);

  const revenueEntries = entries.filter((e) => e.kind === "thu");
  const cashTotal = revenueEntries.filter((e) => e.paymentMethod === "Tiền mặt").reduce((s, e) => s + Number(e.total), 0);
  const transferTotal = revenueEntries.filter((e) => e.paymentMethod === "Chuyển khoản").reduce((s, e) => s + Number(e.total), 0);
  const cashCount = revenueEntries.filter((e) => e.paymentMethod === "Tiền mặt").length;
  const transferCount = revenueEntries.filter((e) => e.paymentMethod === "Chuyển khoản").length;

  const filters = [["today", "Hôm nay"], ["week", "7 ngày"], ["month", "Tháng này"], ["all", "Tất cả"]];
  const types = [["all", "Tất cả"], ["thu", "Thu"], ["chi", "Chi"]];

  return (
    <div style={{ animation: "riseIn 0.35s ease" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto" }}>
        {filters.map(([k, l]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)} label={l} />)}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {types.map(([k, l]) => <Chip key={k} active={type === k} onClick={() => setType(k)} label={l} small />)}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", background: C.cream, borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, border: `1px solid ${C.line}` }}>
        <span style={{ color: C.primary, fontWeight: 600 }}>Thu: {fmtVND(totalIn)}</span>
        <span style={{ color: C.berry, fontWeight: 600 }}>Chi: {fmtVND(totalOut)}</span>
        <span style={{ color: C.ink, fontWeight: 700 }}>Ròng: {fmtVND(totalIn - totalOut)}</span>
      </div>

      {revenueEntries.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <Banknote size={14} color={C.primary} />
              <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 500 }}>Tiền mặt · {cashCount} đơn</span>
            </div>
            <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>{fmtVND(cashTotal)}</div>
          </div>
          <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <Landmark size={14} color={C.mango} />
              <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 500 }}>Chuyển khoản · {transferCount} đơn</span>
            </div>
            <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: C.mango }}>{fmtVND(transferTotal)}</div>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div style={{ textAlign: "center", color: C.inkSoft, fontSize: 13, padding: "30px 0" }}>Chưa có giao dịch nào trong khoảng này.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: e.kind === "thu" ? C.primary : C.berry }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.kind === "thu" ? e.itemName : e.category}
                </div>
                <div style={{ fontSize: 11, color: C.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.date}{e.kind === "thu" ? ` · ${e.channel} · ${e.paymentMethod === "Tiền mặt" ? "TM" : "CK"}${e.isPromo ? ` · KM -${fmtVND(e.promoAmount)}` : ""} · SL ${e.quantity} × ${fmtVND(e.unitPrice)}` : (e.description ? ` · ${e.description}` : "")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="ff-mono" style={{ fontSize: 13.5, fontWeight: 700, color: e.kind === "thu" ? C.primary : C.berry, whiteSpace: "nowrap" }}>
                  {e.kind === "thu" ? "+" : "−"}{fmtVND(e.total)}
                </div>
                {e.kind === "thu" && e.feeAmount > 0 && <div style={{ fontSize: 9.5, color: C.inkSoft }}>thực nhận {fmtVND(e.netAmount)}</div>}
              </div>
              <button onClick={() => (e.kind === "thu" ? onDeleteRevenue(e.id) : onDeleteExpense(e.id))} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <Trash2 size={15} color={C.inkSoft} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TodaySummary({ todayRevenues, todayExpenses, todayCash, todayTransfer, todayExpenseTotal }) {
  const totalRev = todayCash + todayTransfer;
  const net = totalRev - todayExpenseTotal;

  const orders = useMemo(() => {
    const map = new Map();
    todayRevenues.forEach((r) => {
      const key = r.orderId || r.id;
      if (!map.has(key)) map.set(key, { key, channel: r.channel, paymentMethod: r.paymentMethod, items: [], total: 0 });
      const o = map.get(key);
      o.items.push(r);
      o.total += Number(r.total);
    });
    return Array.from(map.values());
  }, [todayRevenues]);

  return (
    <div style={{ animation: "riseIn 0.35s ease" }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Hôm nay — để kết sổ cuối ngày</div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <Banknote size={14} color={C.primary} />
            <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 500 }}>Tiền mặt</span>
          </div>
          <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>{fmtVND(todayCash)}</div>
        </div>
        <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <Landmark size={14} color={C.mango} />
            <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 500 }}>Chuyển khoản</span>
          </div>
          <div className="ff-mono" style={{ fontSize: 15, fontWeight: 700, color: C.mango }}>{fmtVND(todayTransfer)}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", background: C.cream, borderRadius: 12, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, border: `1px solid ${C.line}` }}>
        <span style={{ color: C.primary, fontWeight: 600 }}>Thu: {fmtVND(totalRev)}</span>
        <span style={{ color: C.berry, fontWeight: 600 }}>Chi: {fmtVND(todayExpenseTotal)}</span>
        <span style={{ color: C.ink, fontWeight: 700 }}>Ròng: {fmtVND(net)}</span>
      </div>

      <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 8 }}>
        Đơn hàng hôm nay {orders.length > 0 ? `(${orders.length})` : ""}
      </div>
      {orders.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.inkSoft, padding: "6px 0 16px" }}>Chưa có đơn nào hôm nay.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {orders.map((o) => (
            <div key={o.key} style={{ background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
                  {o.items.map((it) => `${it.itemName} ×${it.quantity}`).join(", ")}
                </div>
                <div className="ff-mono" style={{ fontSize: 13.5, fontWeight: 700, color: C.primary, whiteSpace: "nowrap" }}>{fmtVND(o.total)}</div>
              </div>
              <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 4 }}>
                {o.channel} · {o.paymentMethod === "Tiền mặt" ? "Tiền mặt" : "Chuyển khoản"}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 8 }}>
        Chi phí hôm nay {todayExpenses.length > 0 ? `(${todayExpenses.length})` : ""}
      </div>
      {todayExpenses.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.inkSoft, padding: "6px 0" }}>Chưa có khoản chi nào hôm nay.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {todayExpenses.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.card, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 12.5, color: C.ink }}>
                {e.category}{e.description ? ` · ${e.description}` : ""}
              </div>
              <div className="ff-mono" style={{ fontSize: 13, fontWeight: 700, color: C.berry }}>−{fmtVND(e.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label, small }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? "5px 12px" : "6px 14px", borderRadius: 20, border: `1px solid ${active ? C.primary : C.line}`,
      background: active ? C.primary : "#fff", color: active ? "#fff" : C.inkSoft,
      fontSize: small ? 11.5 : 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {label}
    </button>
  );
}
