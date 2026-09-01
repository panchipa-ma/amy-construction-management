const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nthMonday(year: number, month: number, nth: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (nth - 1) * 7;
}

function vernalEquinoxDay(year: number): number {
  return Math.floor(
    20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
  );
}

function autumnalEquinoxDay(year: number): number {
  return Math.floor(
    23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
  );
}

function addHoliday(
  holidays: Map<string, string>,
  year: number,
  month: number,
  day: number,
  name: string,
) {
  holidays.set(dateKey(year, month, day), name);
}

/**
 * 日本の祝日を、法改正で変わる代表的なルールを含めて算出します。
 * 工程表の表示用なので、祝日名の完全な法令データではなく日付判定を目的にしています。
 */
export function japaneseHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  addHoliday(holidays, year, 1, 1, "元日");

  if (year >= 2000) addHoliday(holidays, year, 1, nthMonday(year, 1, 2), "成人の日");
  if (year >= 1967) addHoliday(holidays, year, 2, 11, "建国記念の日");
  if (year >= 2020) addHoliday(holidays, year, 2, 23, "天皇誕生日");
  if (year >= 1989 && year <= 2018) addHoliday(holidays, year, 12, 23, "天皇誕生日");

  if (year >= 1949) {
    addHoliday(holidays, year, 3, vernalEquinoxDay(year), "春分の日");
  }
  addHoliday(holidays, year, 4, 29, year >= 2007 ? "昭和の日" : "みどりの日");
  addHoliday(holidays, year, 5, 3, "憲法記念日");
  addHoliday(holidays, year, 5, 4, "みどりの日");
  addHoliday(holidays, year, 5, 5, "こどもの日");

  if (year >= 2003) {
    addHoliday(holidays, year, 7, nthMonday(year, 7, 3), "海の日");
  } else if (year >= 1996) {
    addHoliday(holidays, year, 7, 20, "海の日");
  }

  if (year >= 2003) {
    addHoliday(holidays, year, 9, nthMonday(year, 9, 3), "敬老の日");
  } else if (year >= 1966) {
    addHoliday(holidays, year, 9, 15, "敬老の日");
  }
  if (year >= 1949) {
    addHoliday(holidays, year, 9, autumnalEquinoxDay(year), "秋分の日");
  }

  if (year >= 2000) {
    addHoliday(holidays, year, 10, nthMonday(year, 10, 2), "スポーツの日");
  } else if (year >= 1966) {
    addHoliday(holidays, year, 10, 10, "体育の日");
  }
  addHoliday(holidays, year, 11, 3, "文化の日");
  addHoliday(holidays, year, 11, 23, "勤労感謝の日");

  // 東京オリンピックに伴う特例移動日。
  if (year === 2020) {
    holidays.delete(dateKey(year, 7, 20));
    holidays.delete(dateKey(year, 10, 12));
    addHoliday(holidays, year, 7, 23, "海の日");
    addHoliday(holidays, year, 7, 24, "スポーツの日");
    addHoliday(holidays, year, 8, 10, "山の日");
  }
  if (year === 2021) {
    holidays.delete(dateKey(year, 7, nthMonday(year, 7, 3)));
    holidays.delete(dateKey(year, 10, nthMonday(year, 10, 2)));
    addHoliday(holidays, year, 7, 22, "海の日");
    addHoliday(holidays, year, 7, 23, "スポーツの日");
    addHoliday(holidays, year, 8, 8, "山の日");
  } else if (year >= 2016) {
    addHoliday(holidays, year, 8, 11, "山の日");
  }

  // 祝日に挟まれた平日は「国民の休日」。
  for (let month = 1; month <= 12; month++) {
    const last = new Date(year, month, 0).getDate();
    for (let day = 2; day < last; day++) {
      const key = dateKey(year, month, day);
      if (holidays.has(key)) continue;
      const current = new Date(year, month - 1, day);
      if (
        current.getDay() !== 0 &&
        holidays.has(dateKey(year, month, day - 1)) &&
        holidays.has(dateKey(year, month, day + 1))
      ) {
        addHoliday(holidays, year, month, day, "国民の休日");
      }
    }
  }

  // 日曜に重なった祝日は、次の祝日でない平日に振り替え。
  for (const [key, name] of [...holidays]) {
    const holidayDate = new Date(`${key}T00:00:00`);
    if (holidayDate.getDay() !== 0) continue;
    let substitute = new Date(holidayDate.getTime() + DAY_MS);
    while (holidays.has(toDateKey(substitute))) {
      substitute = new Date(substitute.getTime() + DAY_MS);
    }
    holidays.set(toDateKey(substitute), `${name}（振替休日）`);
  }

  return holidays;
}

function toDateKey(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function japaneseHolidayName(date: Date): string | null {
  return japaneseHolidays(date.getFullYear()).get(toDateKey(date)) ?? null;
}

export function isProjectHoliday(date: Date, saturdayWork = true): boolean {
  const day = date.getDay();
  return day === 0 || (!saturdayWork && day === 6) || japaneseHolidayName(date) != null;
}