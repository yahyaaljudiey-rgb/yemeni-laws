// حاسبة المواريث (الفرائض) — محرّك حساب أنصبة الورثة
// مبنية على أحكام المواريث في قانون الأحوال الشخصية اليمني رقم (20) لسنة 1992م
// وأصول علم الفرائض (الفروض، التعصيب، الحجب، العول، الرد، العمريتان، العصبة مع الغير).
//
// تنبيه مهم: لا تشمل هذه النسخة مسألة «الجد مع الإخوة» (المعادّة) — إذ يُعامَل الجد
// هنا معاملة الأب فيحجب الإخوة، وهو أحد الأقوال؛ كما لا تشمل ذوي الأرحام والحالات
// النادرة (الخنثى، المفقود، الحمل، المشتركة…). النتيجة استرشادية ويجب مراجعة المختص.

// ————————————————————————————— كسور دقيقة —————————————————————————————

export interface Frac {
  n: number; // البسط
  d: number; // المقام
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
function fr(n: number, d: number): Frac {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
function add(a: Frac, b: Frac): Frac {
  return fr(a.n * b.d + b.n * a.d, a.d * b.d);
}
function sub(a: Frac, b: Frac): Frac {
  return fr(a.n * b.d - b.n * a.d, a.d * b.d);
}
function mul(a: Frac, b: Frac): Frac {
  return fr(a.n * b.n, a.d * b.d);
}
function cmp(a: Frac, b: Frac): number {
  return a.n * b.d - b.n * a.d;
}
const ZERO: Frac = { n: 0, d: 1 };
function isZero(f: Frac): boolean {
  return f.n === 0;
}
export function fracToString(f: Frac): string {
  if (f.n === 0) return "0";
  if (f.d === 1) return `${f.n}`;
  return `${f.n}/${f.d}`;
}
export function fracToPercent(f: Frac): string {
  const p = (f.n / f.d) * 100;
  return `${p.toLocaleString("ar-YE", { maximumFractionDigits: 2 })}٪`;
}

// ————————————————————————————— المدخلات —————————————————————————————

export interface Heirs {
  husband: boolean;
  wives: number; // عدد الزوجات (0-4)
  father: boolean;
  mother: boolean;
  grandfather: boolean; // أب الأب (يُعتبر إن لم يوجد أب)
  grandmother: number; // عدد الجدّات الوارثات
  sons: number;
  daughters: number;
  grandsons: number; // أبناء الابن
  granddaughters: number; // بنات الابن
  fullBrothers: number; // إخوة أشقّاء
  fullSisters: number; // أخوات شقيقات
  paternalBrothers: number; // إخوة لأب
  paternalSisters: number; // أخوات لأب
  maternalSiblings: number; // إخوة لأم (ذكوراً وإناثاً)
}

export const EMPTY_HEIRS: Heirs = {
  husband: false,
  wives: 0,
  father: false,
  mother: false,
  grandfather: false,
  grandmother: 0,
  sons: 0,
  daughters: 0,
  grandsons: 0,
  granddaughters: 0,
  fullBrothers: 0,
  fullSisters: 0,
  paternalBrothers: 0,
  paternalSisters: 0,
  maternalSiblings: 0,
};

// ————————————————————————————— المخرجات —————————————————————————————

export interface Allocation {
  key: string;
  label: string; // اسم الوارث (جمع)
  count: number; // العدد
  share: Frac; // النصيب الإجمالي للمجموعة
  perHead: Frac; // نصيب الفرد الواحد (للمجموعة المتجانسة)
  reason: string; // سبب النصيب
  males?: number; // عدد الذكور (في العصبة المختلطة)
  females?: number; // عدد الإناث
  perMale?: Frac; // نصيب الذكر الواحد (للذكر مثل حظّ الأنثيين)
  perFemale?: Frac; // نصيب الأنثى الواحدة
}

export interface InheritanceResult {
  allocations: Allocation[];
  blocked: { label: string; by: string }[]; // المحجوبون
  flags: {
    awl: boolean; // عول
    radd: boolean; // ردّ
    umariyya: boolean; // العمريتان
    asabaMaaGhair: boolean; // عصبة مع الغير (الأخوات مع البنات)
    residueToTreasury: boolean; // بقي فائض لبيت المال/ذوي الأرحام
  };
  notes: string[];
  baseOriginal: number; // أصل المسألة
  baseFinal: number; // أصلها بعد العول/الرد (للتوضيح)
}

// ————————————————————————————— المحرّك —————————————————————————————

export function computeInheritance(h: Heirs): InheritanceResult {
  const notes: string[] = [];
  const blocked: { label: string; by: string }[] = [];
  const flags = {
    awl: false,
    radd: false,
    umariyya: false,
    asabaMaaGhair: false,
    residueToTreasury: false,
  };

  // الفرع الوارث
  const hasDescMale = h.sons > 0 || h.grandsons > 0;
  const hasDescFemale = h.daughters > 0 || h.granddaughters > 0;
  const hasDesc = hasDescMale || hasDescFemale;

  // من يقوم مقام الأب في التعصيب والحجب
  const patriarch: "father" | "grandfather" | null = h.father
    ? "father"
    : h.grandfather
      ? "grandfather"
      : null;
  if (!h.father && h.grandfather) {
    notes.push(
      "عومل الجدّ معاملة الأب (يحجب الإخوة) — وهو أحد الأقوال، ومسألة الجدّ مع الإخوة محلّ خلاف فقهي.",
    );
  }

  // عدد الإخوة (للحجب الأم من الثلث إلى السدس) — حتى المحجوبون يؤثّرون
  const siblingCount =
    h.fullBrothers +
    h.fullSisters +
    h.paternalBrothers +
    h.paternalSisters +
    h.maternalSiblings;

  // الفروض المجمّعة
  type Share = { share: Frac; reason: string };
  const fards: Record<string, { label: string; count: number } & Share> = {};
  function setFard(
    key: string,
    label: string,
    count: number,
    share: Frac,
    reason: string,
  ) {
    fards[key] = { label, count, share, reason };
  }

  // العصبة المرشّحة (تأخذ الباقي) — تُحدَّد لاحقاً
  type AsabaGroup = {
    key: string;
    label: string;
    count: number;
    males: number;
    females: number;
    reason: string;
  };
  let asaba: AsabaGroup | null = null;

  // ——— الزوجية ———
  const spousePresent = h.husband || h.wives > 0;
  if (h.husband) {
    setFard(
      "husband",
      "الزوج",
      1,
      hasDesc ? fr(1, 4) : fr(1, 2),
      hasDesc ? "الربع لوجود الفرع الوارث" : "النصف لعدم الفرع الوارث",
    );
  }
  if (h.wives > 0) {
    setFard(
      "wives",
      "الزوجة",
      h.wives,
      hasDesc ? fr(1, 8) : fr(1, 4),
      hasDesc ? "الثمن لوجود الفرع الوارث" : "الربع لعدم الفرع الوارث",
    );
  }

  // ——— الأم ———
  // العمريتان: إذا انحصر الورثة في (زوج/زوجة + أم + أب) فالأم ثلث الباقي
  const onlyParentsAndSpouse =
    h.mother &&
    h.father &&
    spousePresent &&
    !hasDesc &&
    siblingCount === 0 &&
    h.grandmother === 0 &&
    !h.grandfather;

  if (h.mother) {
    if (onlyParentsAndSpouse) {
      flags.umariyya = true;
      const spouseShare = h.husband ? fr(1, 2) : fr(1, 4);
      const remainder = sub(fr(1, 1), spouseShare);
      const motherShare = mul(remainder, fr(1, 3));
      setFard(
        "mother",
        "الأم",
        1,
        motherShare,
        "ثلث الباقي بعد نصيب الزوج/الزوجة (العُمريتان)",
      );
    } else if (hasDesc || siblingCount >= 2) {
      setFard(
        "mother",
        "الأم",
        1,
        fr(1, 6),
        hasDesc
          ? "السدس لوجود الفرع الوارث"
          : "السدس لوجود عددٍ من الإخوة (اثنين فأكثر)",
      );
    } else {
      setFard("mother", "الأم", 1, fr(1, 3), "الثلث لعدم الحاجب");
    }
  }

  // ——— الجدّة ———
  if (h.grandmother > 0) {
    if (h.mother) {
      blocked.push({ label: "الجدّة", by: "الأم" });
    } else {
      setFard(
        "grandmother",
        "الجدّة",
        h.grandmother,
        fr(1, 6),
        "السدس (للجدّة أو الجدّات يتقاسمنه)",
      );
      if (h.father) {
        notes.push(
          "إن كانت الجدّة لأب (أمّ الأب) فهي محجوبة بالأب؛ تأكّد من جهة الجدّة.",
        );
      }
    }
  }

  // ——— الأب / الجدّ ———
  if (patriarch) {
    const plabel = patriarch === "father" ? "الأب" : "الجدّ";
    const pkey = patriarch;
    if (hasDescMale) {
      setFard(pkey, plabel, 1, fr(1, 6), "السدس لوجود الفرع الوارث المذكَّر");
    } else if (hasDescFemale) {
      // السدس فرضاً + الباقي تعصيباً
      setFard(
        pkey,
        plabel,
        1,
        fr(1, 6),
        "السدس فرضاً مع وجود الفرع الوارث المؤنَّث (والباقي تعصيباً)",
      );
      asaba = {
        key: pkey,
        label: plabel,
        count: 1,
        males: 1,
        females: 0,
        reason: "الباقي تعصيباً بعد أصحاب الفروض",
      };
    } else {
      asaba = {
        key: pkey,
        label: plabel,
        count: 1,
        males: 1,
        females: 0,
        reason: "عصبة (الباقي بعد أصحاب الفروض)",
      };
    }
  }

  // ——— الإخوة لأم ———
  if (h.maternalSiblings > 0) {
    if (hasDesc || patriarch) {
      blocked.push({
        label: "الإخوة لأم",
        by: hasDesc ? "الفرع الوارث" : patriarch === "father" ? "الأب" : "الجدّ",
      });
    } else {
      setFard(
        "maternalSiblings",
        "الإخوة لأم",
        h.maternalSiblings,
        h.maternalSiblings === 1 ? fr(1, 6) : fr(1, 3),
        h.maternalSiblings === 1
          ? "السدس للواحد"
          : "الثلث للاثنين فأكثر يتقاسمونه بالسوية",
      );
    }
  }

  // ——— الأبناء وبنات الابن ———
  // الأبناء (مع البنات) عصبة بالنفس/بالغير
  if (h.sons > 0) {
    asaba = {
      key: "children",
      label: h.daughters > 0 ? "الأبناء والبنات" : "الأبناء",
      count: h.sons + h.daughters,
      males: h.sons,
      females: h.daughters,
      reason:
        h.daughters > 0
          ? "الباقي تعصيباً (للذكر مثل حظّ الأنثيين)"
          : "الباقي تعصيباً",
    };
    // أبناء/بنات الابن محجوبون بالابن
    if (h.grandsons > 0)
      blocked.push({ label: "أبناء الابن", by: "الابن" });
    if (h.granddaughters > 0)
      blocked.push({ label: "بنات الابن", by: "الابن" });
  } else {
    // لا أبناء مباشرون
    if (h.daughters === 1) {
      setFard("daughters", "البنت", 1, fr(1, 2), "النصف للبنت الواحدة");
    } else if (h.daughters >= 2) {
      setFard(
        "daughters",
        "البنات",
        h.daughters,
        fr(2, 3),
        "الثلثان للبنتين فأكثر",
      );
    }

    // فرع الابن
    if (h.grandsons > 0) {
      // ابن الابن (ومعه بنت الابن) عصبة
      asaba = {
        key: "grandchildren",
        label: h.granddaughters > 0 ? "أبناء وبنات الابن" : "أبناء الابن",
        count: h.grandsons + h.granddaughters,
        males: h.grandsons,
        females: h.granddaughters,
        reason: "الباقي تعصيباً (للذكر مثل حظّ الأنثيين)",
      };
    } else if (h.granddaughters > 0) {
      if (h.daughters === 0) {
        if (h.granddaughters === 1) {
          setFard(
            "granddaughters",
            "بنت الابن",
            1,
            fr(1, 2),
            "النصف لبنت الابن الواحدة",
          );
        } else {
          setFard(
            "granddaughters",
            "بنات الابن",
            h.granddaughters,
            fr(2, 3),
            "الثلثان لبنات الابن",
          );
        }
      } else if (h.daughters === 1) {
        setFard(
          "granddaughters",
          "بنت الابن",
          h.granddaughters,
          fr(1, 6),
          "السدس تكملةً للثلثين مع البنت الصلبية",
        );
      } else {
        // بنتان فأكثر ولا ابن ابن → محجوبات
        blocked.push({
          label: "بنات الابن",
          by: "استكمال البنات الثلثين (دون ابن ابن)",
        });
      }
    }
  }

  // ——— الإخوة الأشقّاء ———
  // يُحجبون بالفرع الوارث المذكَّر وبالأب/الجدّ
  const fullBlockedBy = hasDescMale
    ? "الفرع الوارث المذكَّر"
    : patriarch === "father"
      ? "الأب"
      : patriarch === "grandfather"
        ? "الجدّ"
        : null;

  let fullSistersAreResiduary = false; // عصبة مع الغير
  if (h.fullBrothers > 0 || h.fullSisters > 0) {
    if (fullBlockedBy) {
      if (h.fullBrothers > 0)
        blocked.push({ label: "الإخوة الأشقّاء", by: fullBlockedBy });
      if (h.fullSisters > 0)
        blocked.push({ label: "الأخوات الشقيقات", by: fullBlockedBy });
    } else if (h.fullBrothers > 0) {
      // عصبة بالنفس (مع الأخوات بالغير)
      asaba = {
        key: "fullSiblings",
        label:
          h.fullSisters > 0 ? "الإخوة والأخوات الأشقّاء" : "الإخوة الأشقّاء",
        count: h.fullBrothers + h.fullSisters,
        males: h.fullBrothers,
        females: h.fullSisters,
        reason:
          h.fullSisters > 0
            ? "الباقي تعصيباً (للذكر مثل حظّ الأنثيين)"
            : "الباقي تعصيباً",
      };
    } else {
      // أخوات شقيقات بلا أخ شقيق
      if (hasDescFemale) {
        // عصبة مع الغير (الأخوات مع البنات) — يأخذن الباقي
        flags.asabaMaaGhair = true;
        fullSistersAreResiduary = true;
        asaba = {
          key: "fullSisters",
          label: h.fullSisters === 1 ? "الأخت الشقيقة" : "الأخوات الشقيقات",
          count: h.fullSisters,
          males: 0,
          females: h.fullSisters,
          reason: "عصبة مع الغير (الأخوات مع البنات يأخذن الباقي)",
        };
      } else if (h.fullSisters === 1) {
        setFard(
          "fullSisters",
          "الأخت الشقيقة",
          1,
          fr(1, 2),
          "النصف للأخت الشقيقة الواحدة",
        );
      } else {
        setFard(
          "fullSisters",
          "الأخوات الشقيقات",
          h.fullSisters,
          fr(2, 3),
          "الثلثان للأختين فأكثر",
        );
      }
    }
  }

  // ——— الإخوة لأب ———
  // يُحجبون بكلّ ما يحجب الأشقّاء + بالأخ الشقيق + بالأخت الشقيقة العصبة مع الغير
  // + بالأختين الشقيقتين (إن استكملتا الثلثين) ما لم يوجد أخ لأب
  if (h.paternalBrothers > 0 || h.paternalSisters > 0) {
    let pBlockedBy: string | null = fullBlockedBy;
    if (!pBlockedBy && h.fullBrothers > 0) pBlockedBy = "الأخ الشقيق";
    if (!pBlockedBy && fullSistersAreResiduary)
      pBlockedBy = "الأخت الشقيقة (عصبة مع الغير)";
    // أختان شقيقتان فأكثر أخذتا الثلثين تحجبان الإخوة لأب إلا مع وجود أخ لأب
    const twoFullSistersFard =
      h.fullBrothers === 0 &&
      !fullSistersAreResiduary &&
      h.fullSisters >= 2;
    if (!pBlockedBy && twoFullSistersFard && h.paternalBrothers === 0) {
      pBlockedBy = "الأختين الشقيقتين (استكملتا الثلثين)";
    }

    if (pBlockedBy) {
      if (h.paternalBrothers > 0)
        blocked.push({ label: "الإخوة لأب", by: pBlockedBy });
      if (h.paternalSisters > 0)
        blocked.push({ label: "الأخوات لأب", by: pBlockedBy });
    } else if (h.paternalBrothers > 0) {
      asaba = {
        key: "paternalSiblings",
        label:
          h.paternalSisters > 0 ? "الإخوة والأخوات لأب" : "الإخوة لأب",
        count: h.paternalBrothers + h.paternalSisters,
        males: h.paternalBrothers,
        females: h.paternalSisters,
        reason:
          h.paternalSisters > 0
            ? "الباقي تعصيباً (للذكر مثل حظّ الأنثيين)"
            : "الباقي تعصيباً",
      };
    } else {
      // أخوات لأب بلا أخ لأب
      const oneFullSisterHalf =
        h.fullBrothers === 0 &&
        !fullSistersAreResiduary &&
        h.fullSisters === 1;
      if (oneFullSisterHalf) {
        setFard(
          "paternalSisters",
          "الأخوات لأب",
          h.paternalSisters,
          fr(1, 6),
          "السدس تكملةً للثلثين مع الأخت الشقيقة",
        );
      } else if (hasDescFemale && !fullSistersAreResiduary) {
        // عصبة مع الغير للأخوات لأب (عند عدم وجود شقيقات يأخذن الباقي)
        flags.asabaMaaGhair = true;
        asaba = {
          key: "paternalSisters",
          label:
            h.paternalSisters === 1 ? "الأخت لأب" : "الأخوات لأب",
          count: h.paternalSisters,
          males: 0,
          females: h.paternalSisters,
          reason: "عصبة مع الغير (الأخوات مع البنات يأخذن الباقي)",
        };
      } else if (h.paternalSisters === 1) {
        setFard("paternalSisters", "الأخت لأب", 1, fr(1, 2), "النصف للواحدة");
      } else if (h.paternalSisters >= 2) {
        setFard(
          "paternalSisters",
          "الأخوات لأب",
          h.paternalSisters,
          fr(2, 3),
          "الثلثان للأختين فأكثر",
        );
      }
    }
  }

  // ————————————————————————————— التجميع والتسوية —————————————————————————————

  // مجموع الفروض
  let fardSum: Frac = ZERO;
  for (const k of Object.keys(fards)) fardSum = add(fardSum, fards[k].share);

  const allocations: Allocation[] = [];
  // معلومات تقسيم الذكور/الإناث للعصبة المختلطة (للذكر مثل حظّ الأنثيين)
  const genderInfo: Record<string, { males: number; females: number }> = {};
  if (asaba && asaba.males > 0 && asaba.females > 0) {
    genderInfo[asaba.key] = { males: asaba.males, females: asaba.females };
  }
  function pushAlloc(
    key: string,
    label: string,
    count: number,
    share: Frac,
    reason: string,
  ) {
    const gi = genderInfo[key];
    const alloc: Allocation = {
      key,
      label,
      count,
      share,
      perHead: count > 0 ? fr(share.n, share.d * count) : share,
      reason,
    };
    if (gi) {
      const parts = gi.males * 2 + gi.females;
      alloc.males = gi.males;
      alloc.females = gi.females;
      alloc.perMale = mul(share, fr(2, parts));
      alloc.perFemale = mul(share, fr(1, parts));
    }
    allocations.push(alloc);
  }

  const cmpSumOne = cmp(fardSum, fr(1, 1));

  if (cmpSumOne > 0) {
    // ——— العول ———
    flags.awl = true;
    // الأصل بعد العول = مجموع البسوط على مقام موحَّد
    for (const k of Object.keys(fards)) {
      const f = fards[k];
      // النصيب الفعلي = share / fardSum
      const actual = mul(f.share, fr(fardSum.d, fardSum.n));
      pushAlloc(k, f.label, f.count, actual, f.reason + " (مع العول)");
    }
    if (asaba) {
      blocked.push({ label: asaba.label, by: "العول (لا يبقى شيء للعصبة)" });
    }
    notes.push("حدث العول: زادت الفروض على أصل المسألة فنُقِص نصيب كلٍّ بنسبته.");
  } else if (cmpSumOne === 0) {
    // مطابق — لا عول ولا ردّ
    for (const k of Object.keys(fards)) {
      const f = fards[k];
      pushAlloc(k, f.label, f.count, f.share, f.reason);
    }
    if (asaba)
      blocked.push({ label: asaba.label, by: "استغراق الفروض للتركة" });
  } else {
    // مجموع الفروض < 1 → يوجد باقٍ
    const residue = sub(fr(1, 1), fardSum);
    // ضع الفروض كما هي
    for (const k of Object.keys(fards)) {
      const f = fards[k];
      pushAlloc(k, f.label, f.count, f.share, f.reason);
    }
    if (asaba && asaba.count > 0) {
      // العصبة تأخذ الباقي
      pushAlloc(asaba.key, asaba.label, asaba.count, residue, asaba.reason);
    } else {
      // لا عصبة → ردّ على أصحاب الفروض عدا الزوجية
      const nonSpouseKeys = Object.keys(fards).filter(
        (k) => k !== "husband" && k !== "wives",
      );
      if (nonSpouseKeys.length === 0) {
        // لا أحد للرّد عليه (زوجية فقط أو لا أحد) → الباقي لبيت المال/ذوي الأرحام
        flags.residueToTreasury = true;
        notes.push(
          "بقي فائض لا عصبة له ولا يُرَدّ على الزوجية؛ يُصرف لذوي الأرحام أو بيت المال.",
        );
      } else {
        flags.radd = true;
        // أساس الرد = مجموع فروض غير الزوجية
        let baseSum: Frac = ZERO;
        for (const k of nonSpouseKeys) baseSum = add(baseSum, fards[k].share);
        // كلٌّ يأخذ: share + residue * (share / baseSum)
        for (const a of allocations) {
          if (a.key === "husband" || a.key === "wives") continue;
          const f = fards[a.key];
          if (!f) continue;
          const extra = mul(residue, mul(f.share, fr(baseSum.d, baseSum.n)));
          a.share = add(a.share, extra);
          a.perHead =
            a.count > 0 ? fr(a.share.n, a.share.d * a.count) : a.share;
          a.reason += " (مع الردّ)";
        }
        notes.push(
          "حدث الردّ: بقي فائض بعد الفروض ولا عصبة، فرُدّ على أصحاب الفروض (عدا الزوجية) بنسبة فروضهم.",
        );
      }
    }
  }

  // أصل المسألة (للتوضيح): المقام المشترك للأنصبة النهائية
  let lcm = 1;
  for (const a of allocations) lcm = (lcm * a.share.d) / gcd(lcm, a.share.d);
  const baseFinal = lcm;
  const baseOriginal = fardSum.d;

  // ترتيب العرض
  const order = [
    "husband",
    "wives",
    "father",
    "grandfather",
    "mother",
    "grandmother",
    "children",
    "daughters",
    "grandchildren",
    "granddaughters",
    "fullSiblings",
    "fullSisters",
    "paternalSiblings",
    "paternalSisters",
    "maternalSiblings",
  ];
  allocations.sort(
    (a, b) =>
      (order.indexOf(a.key) === -1 ? 99 : order.indexOf(a.key)) -
      (order.indexOf(b.key) === -1 ? 99 : order.indexOf(b.key)),
  );

  return {
    allocations: allocations.filter((a) => !isZero(a.share)),
    blocked,
    flags,
    notes,
    baseOriginal,
    baseFinal,
  };
}
