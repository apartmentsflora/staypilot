/**
 * Email HTML templates for Apartments Flora guest messaging.
 *
 * Branding:  navy #122943, gold #C9A84C, warm white #fffdf8, font Georgia serif.
 * Two types: "welcome" (booking confirmation) and "farewell" (departure + Google review).
 * Supported languages: bg, en, de, fr, ru, uk, no
 */

export type GuestLang = "bg" | "en" | "de" | "fr" | "ru" | "uk" | "no";

export const SUPPORTED_LANGS: { code: GuestLang; label: string; flag: string }[] = [
  { code: "en", label: "English",    flag: "🇬🇧" },
  { code: "bg", label: "Български",  flag: "🇧🇬" },
  { code: "de", label: "Deutsch",    flag: "🇩🇪" },
  { code: "fr", label: "Français",   flag: "🇫🇷" },
  { code: "ru", label: "Русский",    flag: "🇷🇺" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "no", label: "Norsk",      flag: "🇳🇴" },
];

export interface TemplateData {
  guestName: string;
  roomCode: string;
  checkin: string;   // YYYY-MM-DD
  checkout: string;  // YYYY-MM-DD
  nights: number;
  total: string;     // e.g. "€240"
  guests: number;
  children: number;
  cots: number;
  arrivalTime: string;
  departTime: string;
  notes?: string;    // special requests
  lang?: GuestLang;
  // v1.2 — B8/B9: whether the guest opted into the underground parking
  // at booking time. Controls which paragraph renders in the amenities
  // block (reserved-confirmation vs. Green Zone fallback).
  parking?: boolean;
}

const GOOGLE_REVIEW_URL =
  "https://search.google.com/local/writereview?placeid=ChIJJdLJPZOUpkAir892XPEitg";

/* ── Translations ────────────────────────────────────────────────────────── */
interface WelcomeStrings {
  heading: string;
  intro: (name: string) => string;
  room: string;
  checkin: string;
  checkout: string;
  nights: string;
  guests: string;
  arrival: string;
  departure: string;
  cots: string;
  specialRequests: string;
  total: string;
  closing: string;
  subject: (name: string) => string;
  // Deposit section
  depositImportant: string;
  depositMsg: (amount: string) => string;
  depositWithin: string;
  depositBankTitle: string;
  depositRecipientLabel: string;
  depositRecipient: string;
  depositIbanLabel: string;
  depositAmountLabel: string;
  depositAmountFrom: (total: string) => string;
  depositRefLabel: string;
  depositRef: (room: string, checkin: string, checkout: string) => string;
  depositNote: string;
  lateCheckinWarning: string;
  // v1.2 — Arrival amenities: EV charging + parking (underground opt-in
  // vs. Green Zone fallback). One block, two paragraphs.
  evTitle?: string;
  evText?: string;
  parkingTitle?: string;
  parkingSelected?: string;
  parkingFallback?: string;
  // Self check-in instructions block
  selfCheckinTitle: string;
  selfCheckinStep1: string;
  selfCheckinStep2: string;
  selfCheckinStep3: string;
  selfCheckinStep4: string;
  selfCheckinWifi: string;
  selfCheckinContact: string;
}

interface FarewellStrings {
  heading: (name: string) => string;
  body: string;
  reviewAsk: string;
  reviewBtn: string;
  closing: string;
  subject: (name: string) => string;
}

interface WhatsAppStrings {
  welcomeGreeting: (name: string) => string;
  welcomeConfirmed: string;
  welcomeRoom: string;
  welcomeCheckin: string;
  welcomeCheckout: string;
  welcomeNights: string;
  welcomeTotal: string;
  welcomeClosing: string;
  farewellGreeting: (name: string) => string;
  farewellBody: string;
  farewellReviewAsk: string;
  farewellClosing: string;
}

const welcomeI18n: Record<GuestLang, WelcomeStrings> = {
  en: {
    heading: "Your Reservation is Confirmed",
    intro: (n) => `Dear ${n}, we are delighted to confirm your reservation. Every detail of your stay has been prepared with care.`,
    room: "Room",
    checkin: "Check-in",
    checkout: "Check-out",
    nights: "Nights",
    guests: "Guests",
    arrival: "Arrival",
    departure: "Departure",
    cots: "Cots (up to 3 yrs)",
    specialRequests: "Special Requests",
    total: "Total",
    closing: "The sea, the sandy beach, and the Sea Garden await you &mdash; we&rsquo;ll take care of everything else.",
    subject: (n) => `Welcome to Apartments Flora, ${n}!`,
    depositImportant: "IMPORTANT",
    depositMsg: (amt) => `To confirm your reservation, a deposit of 50% &mdash; &euro;${amt} is required`,
    depositWithin: `The deposit must be received in our bank account within <strong style="color:#C9A84C">24 hours</strong> of the booking — otherwise the reservation will be voided.`,
    depositBankTitle: "Bank Transfer",
    depositRecipientLabel: "RECIPIENT",
    depositRecipient: `&ldquo;Buildings&rdquo; EOOD`,
    depositIbanLabel: "IBAN",
    depositAmountLabel: "AMOUNT (DEPOSIT 50%)",
    depositAmountFrom: (total) => `of total &euro;${total}`,
    depositRefLabel: "REASON FOR TRANSFER (REFERENCE)",
    depositRef: (room, ci, co) => `Reservation ${room}, ${ci}-${co}`,
    depositNote: "Please include the reference so the payment can be identified. The payment must be made within 3 business days.",
    lateCheckinWarning: `Check-in after 6:00 PM is conducted via self check-in. Instructions will be sent to the email/phone number you have provided. If you are unable to perform a self check-in, a surcharge of <strong>50% of one night&rsquo;s rate</strong> will apply for the host to personally accommodate you.`,
    selfCheckinTitle: "Self Check-in Instructions",
    selfCheckinStep1: "Locate your building entrance using the address provided",
    selfCheckinStep2: "Enter the building code on the keypad at the entrance door",
    selfCheckinStep3: "Your room key is in the key box near the entrance. Use code provided below",
    selfCheckinStep4: "Proceed to your room and settle in. Towels and linens are prepared for you",
    selfCheckinWifi: "Wi-Fi",
    selfCheckinContact: "If you need assistance, call us at: <strong>+359 879 559 961</strong>",
    evTitle: "\u26A1 EV charging",
    evText: "An EV charging station is located right in front of the building.",
    parkingTitle: "\ud83c\udd7f\ufe0f Parking",
    parkingSelected: "Your underground parking space is reserved &mdash; &euro;10/day, payable at check-in.",
    parkingFallback: "You haven&rsquo;t selected underground parking. You can park nearby in the <strong>Green Zone</strong> &mdash; &euro;1/hour, weekdays 9:00&ndash;19:00, weekends 11:00&ndash;20:00. Alternatives: <a href=\"https://myburgas.com/transport/parking/parking-gurko/\" style=\"color:#1e40af;text-decoration:underline\">Parking Gurko</a>.",
  },
  bg: {
    heading: "Вашата резервация е потвърдена",
    intro: (n) => `Уважаеми ${n}, с удоволствие потвърждаваме Вашата резервация. Всеки детайл от престоя Ви е подготвен с грижа.`,
    room: "Стая",
    checkin: "Настаняване",
    checkout: "Напускане",
    nights: "Нощувки",
    guests: "Гости",
    arrival: "Час на пристигане",
    departure: "Час на заминаване",
    cots: "Кошари (до 3 г.)",
    specialRequests: "Специални желания",
    total: "Обща сума",
    closing: "Морето, пясъчният плаж и Морската градина Ви очакват &mdash; за всичко останало ще се погрижим ние.",
    subject: (n) => `Добре дошли в Apartments Flora, ${n}!`,
    depositImportant: "ВАЖНО",
    depositMsg: (amt) => `За потвърждение на резервацията е необходимо заплащане на капаро 50% &mdash; &euro;${amt}`,
    depositWithin: `Капарото трябва да постъпи по банковата ни сметка в рамките на <strong style="color:#C9A84C">24 часа</strong> от направената резервация — в противен случай резервацията се анулира.`,
    depositBankTitle: "Банков превод",
    depositRecipientLabel: "ПОЛУЧАТЕЛ",
    depositRecipient: `&ldquo;Билдингс&rdquo; ЕООД`,
    depositIbanLabel: "IBAN",
    depositAmountLabel: "СУМА (КАПАРО 50%)",
    depositAmountFrom: (total) => `от обща сума &euro;${total}`,
    depositRefLabel: "ПРИЧИНА ЗА ПРЕВОДА (РЕФЕРЕНЦИЯ)",
    depositRef: (room, ci, co) => `Резервация ${room}, ${ci}-${co}`,
    depositNote: "Моля задължително посочете причината за превода, за да може плащането да бъде идентифицирано. Плащането трябва да бъде извършено в рамките на 3 дни.",
    lateCheckinWarning: `Настаняване след 18:00 часа се извършва чрез самостоятелно настаняване (self check-in), за което ще получите инструкции на посочения имейл/телефон. При невъзможност за самостоятелно настаняване ще бъде начислена такса от <strong>50% от цената за една нощувка</strong> за физическото присъствие на домакина.`,
    selfCheckinTitle: "Инструкции за самостоятелно настаняване",
    selfCheckinStep1: "Намерете входа на сградата по посочения адрес",
    selfCheckinStep2: "Въведете кода на клавиатурата на входната врата",
    selfCheckinStep3: "Ключът за стаята се намира в кутията до входа. Използвайте кода по-долу",
    selfCheckinStep4: "Настанете се в стаята. Кърпи и спално бельо са подготвени за Вас",
    selfCheckinWifi: "Wi-Fi",
    selfCheckinContact: "При нужда от помощ, обадете се на: <strong>+359 879 559 961</strong>",
    evTitle: "\u26A1 Зареждане на електромобил",
    evText: "Зарядна станция за електромобили е разположена точно пред сградата.",
    parkingTitle: "\ud83c\udd7f\ufe0f Паркинг",
    parkingSelected: "Вашето подземно място е запазено &mdash; &euro;10/ден, плащане при настаняване.",
    parkingFallback: "Не сте избрали подземен паркинг. Наблизо можете да паркирате в <strong>Зелена зона</strong> &mdash; &euro;1/час, делник 9:00&ndash;19:00, уикенд 11:00&ndash;20:00. Алтернативно: <a href=\"https://myburgas.com/transport/parking/parking-gurko/\" style=\"color:#1e40af;text-decoration:underline\">Parking Gurko</a>.",
  },
  de: {
    heading: "Ihre Reservierung ist bestätigt",
    intro: (n) => `Liebe(r) ${n}, wir freuen uns, Ihre Reservierung zu bestätigen. Jedes Detail Ihres Aufenthalts wurde mit Sorgfalt vorbereitet.`,
    room: "Zimmer",
    checkin: "Check-in",
    checkout: "Check-out",
    nights: "Nächte",
    guests: "Gäste",
    arrival: "Ankunft",
    departure: "Abreise",
    cots: "Kinderbetten (bis 3 J.)",
    specialRequests: "Sonderwünsche",
    total: "Gesamt",
    closing: "Das Meer, der Sandstrand und der Meeresgarten erwarten Sie &mdash; um alles andere kümmern wir uns.",
    subject: (n) => `Willkommen bei Apartments Flora, ${n}!`,
    depositImportant: "WICHTIG",
    depositMsg: (amt) => `Zur Bestätigung Ihrer Reservierung ist eine Anzahlung von 50% &mdash; &euro;${amt} erforderlich`,
    depositWithin: `Die Anzahlung muss innerhalb von <strong style="color:#C9A84C">24 Stunden</strong> nach der Buchung auf unserem Bankkonto eingegangen sein — andernfalls wird die Reservierung storniert.`,
    depositBankTitle: "Banküberweisung",
    depositRecipientLabel: "EMPFÄNGER",
    depositRecipient: `&ldquo;Buildings&rdquo; EOOD`,
    depositIbanLabel: "IBAN",
    depositAmountLabel: "BETRAG (ANZAHLUNG 50%)",
    depositAmountFrom: (total) => `vom Gesamtbetrag &euro;${total}`,
    depositRefLabel: "VERWENDUNGSZWECK (REFERENZ)",
    depositRef: (room, ci, co) => `Reservierung ${room}, ${ci}-${co}`,
    depositNote: "Bitte geben Sie unbedingt den Verwendungszweck an, damit die Zahlung zugeordnet werden kann. Die Zahlung muss innerhalb von 3 Werktagen erfolgen.",
    lateCheckinWarning: `Ein Check-in nach 18:00 Uhr erfolgt per Self-Check-in. Die Anleitung wird an die von Ihnen angegebene E-Mail-Adresse/Telefonnummer gesendet. Falls Sie keinen Self-Check-in durchf&uuml;hren k&ouml;nnen, wird eine Geb&uuml;hr von <strong>50% des &Uuml;bernachtungspreises</strong> f&uuml;r die pers&ouml;nliche Unterbringung durch den Gastgeber erhoben.`,
    selfCheckinTitle: "Anleitung zum Self-Check-in",
    selfCheckinStep1: "Finden Sie den Geb&auml;udeeingang anhand der angegebenen Adresse",
    selfCheckinStep2: "Geben Sie den Code auf der Tastatur an der Eingangst&uuml;r ein",
    selfCheckinStep3: "Ihr Zimmerschl&uuml;ssel befindet sich in der Schl&uuml;sselbox am Eingang. Verwenden Sie den unten angegebenen Code",
    selfCheckinStep4: "Gehen Sie zu Ihrem Zimmer. Handt&uuml;cher und Bettw&auml;sche sind f&uuml;r Sie vorbereitet",
    selfCheckinWifi: "WLAN",
    selfCheckinContact: "Falls Sie Hilfe ben&ouml;tigen, rufen Sie uns an: <strong>+359 879 559 961</strong>",
    evTitle: "\u26A1 Ladestation",
    evText: "Eine Ladestation f&uuml;r Elektroautos befindet sich direkt vor dem Geb&auml;ude.",
    parkingTitle: "\ud83c\udd7f\ufe0f Parken",
    parkingSelected: "Ihr Tiefgaragenplatz ist reserviert &mdash; 10&euro;/Tag, zahlbar bei der Anreise.",
    parkingFallback: "Sie haben keine Tiefgarage gew&auml;hlt. Parken k&ouml;nnen Sie in der Nachbarschaft in der <strong>Gr&uuml;nen Zone</strong> &mdash; 1&euro;/Stunde, werktags 9:00&ndash;19:00, am Wochenende 11:00&ndash;20:00. Alternativen: <a href=\"https://myburgas.com/transport/parking/parking-gurko/\" style=\"color:#1e40af;text-decoration:underline\">Parking Gurko</a>.",
  },
  fr: {
    heading: "Votre réservation est confirmée",
    intro: (n) => `Cher(e) ${n}, nous avons le plaisir de confirmer votre réservation. Chaque détail de votre séjour a été préparé avec soin.`,
    room: "Chambre",
    checkin: "Arrivée",
    checkout: "Départ",
    nights: "Nuits",
    guests: "Voyageurs",
    arrival: "Heure d'arrivée",
    departure: "Heure de départ",
    cots: "Lits bébé (jusqu'à 3 ans)",
    specialRequests: "Demandes spéciales",
    total: "Total",
    closing: "La mer, la plage de sable et le Jardin de la Mer vous attendent &mdash; nous nous occuperons de tout le reste.",
    subject: (n) => `Bienvenue à Apartments Flora, ${n} !`,
    depositImportant: "IMPORTANT",
    depositMsg: (amt) => `Pour confirmer votre réservation, un acompte de 50% &mdash; &euro;${amt} est requis`,
    depositWithin: `L&rsquo;acompte doit &ecirc;tre re&ccedil;u sur notre compte bancaire dans un d&eacute;lai de <strong style="color:#C9A84C">24 heures</strong> apr&egrave;s la r&eacute;servation &mdash; sinon la r&eacute;servation sera annul&eacute;e.`,
    depositBankTitle: "Virement bancaire",
    depositRecipientLabel: "BÉNÉFICIAIRE",
    depositRecipient: `&ldquo;Buildings&rdquo; EOOD`,
    depositIbanLabel: "IBAN",
    depositAmountLabel: "MONTANT (ACOMPTE 50%)",
    depositAmountFrom: (total) => `du total de &euro;${total}`,
    depositRefLabel: "MOTIF DU VIREMENT (RÉFÉRENCE)",
    depositRef: (room, ci, co) => `Réservation ${room}, ${ci}-${co}`,
    depositNote: "Veuillez indiquer la r&eacute;f&eacute;rence afin que le paiement puisse &ecirc;tre identifi&eacute;. Le paiement doit &ecirc;tre effectu&eacute; dans un d&eacute;lai de 3 jours ouvrables.",
    lateCheckinWarning: `L&rsquo;arriv&eacute;e apr&egrave;s 18h00 s&rsquo;effectue par self check-in. Les instructions seront envoy&eacute;es &agrave; l&rsquo;adresse e-mail/num&eacute;ro de t&eacute;l&eacute;phone que vous avez indiqu&eacute;. En cas d&rsquo;impossibilit&eacute; d&rsquo;effectuer un self check-in, des frais de <strong>50% du tarif d&rsquo;une nuit</strong> seront factur&eacute;s pour l&rsquo;accueil en personne par l&rsquo;h&ocirc;te.`,
    selfCheckinTitle: "Instructions pour le self check-in",
    selfCheckinStep1: "Trouvez l&rsquo;entr&eacute;e du b&acirc;timent &agrave; l&rsquo;adresse indiqu&eacute;e",
    selfCheckinStep2: "Entrez le code sur le clavier de la porte d&rsquo;entr&eacute;e",
    selfCheckinStep3: "La cl&eacute; de votre chambre se trouve dans la bo&icirc;te &agrave; cl&eacute;s pr&egrave;s de l&rsquo;entr&eacute;e. Utilisez le code ci-dessous",
    selfCheckinStep4: "Installez-vous dans votre chambre. Serviettes et draps sont pr&eacute;par&eacute;s pour vous",
    selfCheckinWifi: "Wi-Fi",
    selfCheckinContact: "Si vous avez besoin d&rsquo;aide, appelez-nous au : <strong>+359 879 559 961</strong>",
    evTitle: "\u26A1 Borne de recharge",
    evText: "Une borne de recharge pour v&eacute;hicules &eacute;lectriques se trouve juste devant le b&acirc;timent.",
    parkingTitle: "\ud83c\udd7f\ufe0f Stationnement",
    parkingSelected: "Votre place en parking souterrain est r&eacute;serv&eacute;e &mdash; 10&euro;/jour, payable &agrave; l&rsquo;arriv&eacute;e.",
    parkingFallback: "Vous n&rsquo;avez pas choisi le parking souterrain. Vous pouvez stationner &agrave; proximit&eacute; dans la <strong>Zone Verte</strong> &mdash; 1&euro;/heure, en semaine 9h00&ndash;19h00, week-ends 11h00&ndash;20h00. Alternatives : <a href=\"https://myburgas.com/transport/parking/parking-gurko/\" style=\"color:#1e40af;text-decoration:underline\">Parking Gurko</a>.",
  },
  ru: {
    heading: "Ваша бронь подтверждена",
    intro: (n) => `Уважаемый(ая) ${n}, мы рады подтвердить Вашу бронь. Каждая деталь Вашего пребывания подготовлена с заботой.`,
    room: "Номер",
    checkin: "Заезд",
    checkout: "Выезд",
    nights: "Ночей",
    guests: "Гости",
    arrival: "Время заезда",
    departure: "Время выезда",
    cots: "Детские кроватки (до 3 лет)",
    specialRequests: "Особые пожелания",
    total: "Итого",
    closing: "Море, песчаный пляж и Приморский парк ждут Вас &mdash; обо всём остальном позаботимся мы.",
    subject: (n) => `Добро пожаловать в Apartments Flora, ${n}!`,
    depositImportant: "ВАЖНО",
    depositMsg: (amt) => `Для подтверждения бронирования необходима предоплата 50% &mdash; &euro;${amt}`,
    depositWithin: `Задаток должен поступить на наш банковский счёт в течение <strong style="color:#C9A84C">24 часов</strong> с момента бронирования — в противном случае бронирование будет аннулировано.`,
    depositBankTitle: "Банковский перевод",
    depositRecipientLabel: "ПОЛУЧАТЕЛЬ",
    depositRecipient: `&ldquo;Buildings&rdquo; EOOD`,
    depositIbanLabel: "IBAN",
    depositAmountLabel: "СУММА (ПРЕДОПЛАТА 50%)",
    depositAmountFrom: (total) => `от общей суммы &euro;${total}`,
    depositRefLabel: "НАЗНАЧЕНИЕ ПЛАТЕЖА (РЕФЕРЕНЦИЯ)",
    depositRef: (room, ci, co) => `Бронирование ${room}, ${ci}-${co}`,
    depositNote: "Пожалуйста, обязательно укажите назначение платежа, чтобы оплата могла быть идентифицирована. Оплата должна быть произведена в течение 3 рабочих дней.",
    lateCheckinWarning: `Заселение после 18:00 осуществляется путём самостоятельного заселения (self check-in). Инструкции будут отправлены на указанный Вами адрес электронной почты/телефон. В случае невозможности самостоятельного заселения взимается доплата в размере <strong>50% от стоимости одной ночи</strong> за личное присутствие хозяина.`,
    selfCheckinTitle: "Инструкции по самостоятельному заселению",
    selfCheckinStep1: "Найдите вход в здание по указанному адресу",
    selfCheckinStep2: "Введите код на клавиатуре входной двери",
    selfCheckinStep3: "Ключ от номера находится в ключнице у входа. Используйте код, указанный ниже",
    selfCheckinStep4: "Расположитесь в номере. Полотенца и постельное бельё подгото��лены для Вас",
    selfCheckinWifi: "Wi-Fi",
    selfCheckinContact: "Если Вам нужна помощь, позвоните нам: <strong>+359 879 559 961</strong>",
    evTitle: "\u26A1 Зарядка электромобиля",
    evText: "Зарядная станция для электромобилей находится прямо перед зданием.",
    parkingTitle: "\ud83c\udd7f\ufe0f Парковка",
    parkingSelected: "Ваше место в подземной парковке забронировано &mdash; 10&euro;/день, оплата при заезде.",
    parkingFallback: "Вы не выбрали подземную парковку. Рядом можно парковаться в <strong>Зелёной зоне</strong> &mdash; 1&euro;/час, будни 9:00&ndash;19:00, выходные 11:00&ndash;20:00. Альтернативы: <a href=\"https://myburgas.com/transport/parking/parking-gurko/\" style=\"color:#1e40af;text-decoration:underline\">Parking Gurko</a>.",
  },
  uk: {
    heading: "Ваше бронювання підтверджено",
    intro: (n) => `Шановний(а) ${n}, ми раді підтвердити Ваше бронювання. Кожна деталь Вашого перебування підготовлена з турботою.`,
    room: "Кімната",
    checkin: "Заїзд",
    checkout: "Виїзд",
    nights: "Ночей",
    guests: "Гості",
    arrival: "Час заїзду",
    departure: "Час виїзду",
    cots: "Дитячі ліжечка (до 3 р.)",
    specialRequests: "Особливі побажання",
    total: "Разом",
    closing: "Море, піщаний пляж та Приморський парк чекають на Вас &mdash; про все інше подбаємо ми.",
    subject: (n) => `Ласкаво просимо до Apartments Flora, ${n}!`,
    depositImportant: "ВАЖЛИВО",
    depositMsg: (amt) => `Для підтвердження бронювання необхідна передоплата 50% &mdash; &euro;${amt}`,
    depositWithin: `Завдаток має надійти на наш банківський рахунок протягом <strong style="color:#C9A84C">24 годин</strong> з моменту бронювання — інакше бронювання буде скасовано.`,
    depositBankTitle: "Банківський переказ",
    depositRecipientLabel: "ОДЕРЖУВАЧ",
    depositRecipient: `&ldquo;Buildings&rdquo; EOOD`,
    depositIbanLabel: "IBAN",
    depositAmountLabel: "СУМА (ПЕРЕДОПЛАТА 50%)",
    depositAmountFrom: (total) => `від загальної суми &euro;${total}`,
    depositRefLabel: "ПРИЗНАЧЕННЯ ПЛАТЕЖУ (РЕФЕРЕНЦІЯ)",
    depositRef: (room, ci, co) => `Бронювання ${room}, ${ci}-${co}`,
    depositNote: "Будь ласка, обов'язково вкажіть призначення платежу, щоб оплату можна було ідентифікувати. Оплата має бути здійснена протягом 3 робочих днів.",
    lateCheckinWarning: `Заселення після 18:00 здійснюється шляхом самостійного заселення (self check-in). Інструкції будуть надіслані на вказану Вами електронну адресу/телефон. У разі неможливості самостійного заселення стягується додаткова плата у розмірі <strong>50% від вартості однієї ночі</strong> за особисту присутність господаря.`,
    selfCheckinTitle: "Інструкції для самостійного заселення",
    selfCheckinStep1: "Знайдіть вхід до будівлі за вказаною адресою",
    selfCheckinStep2: "Введіть код на клавіатурі вхідних дверей",
    selfCheckinStep3: "Ключ від номера знаходиться в ключниці біля входу. Використайте код, вказаний нижче",
    selfCheckinStep4: "Розташуйтесь у номері. Рушники та постільна білизна підготовлені для Вас",
    selfCheckinWifi: "Wi-Fi",
    selfCheckinContact: "Якщо Вам потрібна допомога, зателефонуйте нам: <strong>+359 879 559 961</strong>",
    evTitle: "\u26A1 Зарядка електромобіля",
    evText: "Зарядна станція для електромобілів розташована прямо перед будівлею.",
    parkingTitle: "\ud83c\udd7f\ufe0f Паркінг",
    parkingSelected: "Ваше місце на підземному паркінгу заброньовано &mdash; 10&euro;/день, оплата при заїзді.",
    parkingFallback: "Ви не обрали підземний паркінг. Поруч можна паркуватися у <strong>Зеленій зоні</strong> &mdash; 1&euro;/год, будні 9:00&ndash;19:00, вихідні 11:00&ndash;20:00. Альтернативи: <a href=\"https://myburgas.com/transport/parking/parking-gurko/\" style=\"color:#1e40af;text-decoration:underline\">Parking Gurko</a>.",
  },
  no: {
    heading: "Din reservasjon er bekreftet",
    intro: (n) => `Kjære ${n}, vi er glade for å bekrefte din reservasjon. Hver detalj av oppholdet ditt er forberedt med omhu.`,
    room: "Rom",
    checkin: "Innsjekk",
    checkout: "Utsjekk",
    nights: "Netter",
    guests: "Gjester",
    arrival: "Ankomsttid",
    departure: "Avreisetid",
    cots: "Barnesenger (opptil 3 år)",
    specialRequests: "Spesielle ønsker",
    total: "Totalt",
    closing: "Havet, sandstranden og Sjøhagen venter på deg &mdash; vi tar oss av resten.",
    subject: (n) => `Velkommen til Apartments Flora, ${n}!`,
    depositImportant: "VIKTIG",
    depositMsg: (amt) => `For å bekrefte reservasjonen din kreves et depositum på 50% &mdash; &euro;${amt}`,
    depositWithin: `Depositumet må være mottatt på vår bankkonto innen <strong style="color:#C9A84C">24 timer</strong> etter bestillingen — ellers blir reservasjonen annullert.`,
    depositBankTitle: "Bankoverføring",
    depositRecipientLabel: "MOTTAKER",
    depositRecipient: `&ldquo;Buildings&rdquo; EOOD`,
    depositIbanLabel: "IBAN",
    depositAmountLabel: "BELØP (DEPOSITUM 50%)",
    depositAmountFrom: (total) => `av totalt &euro;${total}`,
    depositRefLabel: "BETALINGSREFERANSE",
    depositRef: (room, ci, co) => `Reservasjon ${room}, ${ci}-${co}`,
    depositNote: "Vennligst oppgi referansen slik at betalingen kan identifiseres. Betalingen m&aring; gjennomf&oslash;res innen 3 virkedager.",
    lateCheckinWarning: `Innsjekk etter kl. 18:00 gjennomf&oslash;res via selvinnsjekking. Instruksjoner vil bli sendt til e-postadressen/telefonnummeret du har oppgitt. Dersom du ikke kan gjennomf&oslash;re selvinnsjekking, vil det p&aring;l&oslash;pe et gebyr p&aring; <strong>50% av prisen for &eacute;n natt</strong> for at verten personlig skal ta imot deg.`,
    selfCheckinTitle: "Instruksjoner for selvinnsjekking",
    selfCheckinStep1: "Finn bygningens inngang p&aring; den oppgitte adressen",
    selfCheckinStep2: "Tast inn koden p&aring; tastaturet ved inngangsd&oslash;ren",
    selfCheckinStep3: "Romnøkkelen din er i nøkkelboksen ved inngangen. Bruk koden nedenfor",
    selfCheckinStep4: "G&aring; til rommet ditt. H&aring;ndklær og sengetøy er klargjort for deg",
    selfCheckinWifi: "Wi-Fi",
    selfCheckinContact: "Trenger du hjelp, ring oss p&aring;: <strong>+359 879 559 961</strong>",
    evTitle: "\u26A1 Ladestasjon",
    evText: "En ladestasjon for elbiler ligger rett foran bygningen.",
    parkingTitle: "\ud83c\udd7f\ufe0f Parkering",
    parkingSelected: "Din underjordiske parkeringsplass er reservert &mdash; 10&euro;/dag, betales ved innsjekk.",
    parkingFallback: "Du har ikke valgt underjordisk parkering. Du kan parkere i n&aelig;rheten i <strong>Gr&oslash;nn sone</strong> &mdash; 1&euro;/time, ukedager 9:00&ndash;19:00, helg 11:00&ndash;20:00. Alternativer: <a href=\"https://myburgas.com/transport/parking/parking-gurko/\" style=\"color:#1e40af;text-decoration:underline\">Parking Gurko</a>.",
  },
};

const farewellI18n: Record<GuestLang, FarewellStrings> = {
  en: {
    heading: (n) => `Thank you, ${n}!`,
    body: "We hope your stay at <strong>Apartments Flora</strong> was filled with ocean breezes, warm sunshine, and moments you&rsquo;ll treasure. The sun-drenched terraces and the sound of the sea will be here waiting for your return.",
    reviewAsk: "If you enjoyed your experience, we&rsquo;d be truly grateful for a review on Google &mdash; it helps fellow travellers discover us.",
    reviewBtn: "Leave a Review",
    closing: "Safe travels and see you again soon!",
    subject: (n) => `Thank you for staying with us, ${n}!`,
  },
  bg: {
    heading: (n) => `Благодарим Ви, ${n}!`,
    body: "Надяваме се, че престоят Ви в <strong>Apartments Flora</strong> беше изпълнен с морски бриз, топло слънце и незабравими моменти. Слънчевите тераси и шумът на морето ще Ви очакват отново.",
    reviewAsk: "Ако сте доволни от преживяването си, ще бъдем искрено благодарни за отзив в Google &mdash; той помага на други пътешественици да ни открият.",
    reviewBtn: "Оставете отзив",
    closing: "Лек път и до скоро отново!",
    subject: (n) => `Благодарим Ви за престоя, ${n}!`,
  },
  de: {
    heading: (n) => `Vielen Dank, ${n}!`,
    body: "Wir hoffen, Ihr Aufenthalt bei <strong>Apartments Flora</strong> war voller Meeresbrise, warmem Sonnenschein und unvergesslichen Momenten. Die sonnigen Terrassen und das Rauschen des Meeres warten auf Ihre Rückkehr.",
    reviewAsk: "Wenn Ihnen Ihr Erlebnis gefallen hat, wären wir Ihnen für eine Bewertung auf Google sehr dankbar &mdash; sie hilft anderen Reisenden, uns zu entdecken.",
    reviewBtn: "Bewertung abgeben",
    closing: "Gute Reise und bis bald!",
    subject: (n) => `Vielen Dank für Ihren Aufenthalt, ${n}!`,
  },
  fr: {
    heading: (n) => `Merci, ${n} !`,
    body: "Nous espérons que votre séjour à <strong>Apartments Flora</strong> a été rempli de brises marines, de soleil chaleureux et de moments inoubliables. Les terrasses ensoleillées et le bruit de la mer vous attendront pour votre retour.",
    reviewAsk: "Si vous avez apprécié votre expérience, nous vous serions très reconnaissants de laisser un avis sur Google &mdash; cela aide d&rsquo;autres voyageurs à nous découvrir.",
    reviewBtn: "Laisser un avis",
    closing: "Bon voyage et à bientôt !",
    subject: (n) => `Merci pour votre séjour, ${n} !`,
  },
  ru: {
    heading: (n) => `Спасибо, ${n}!`,
    body: "Мы надеемся, что Ваш отдых в <strong>Apartments Flora</strong> был наполнен морским бризом, тёплым солнцем и незабываемыми моментами. Солнечные террасы и шум моря будут ждать Вашего возвращения.",
    reviewAsk: "Если Вам понравилось, мы будем очень благодарны за отзыв в Google &mdash; он помогает другим путешественникам найти нас.",
    reviewBtn: "Оставить отзыв",
    closing: "Счастливого пути и до скорой встречи!",
    subject: (n) => `Спасибо за Ваш отдых, ${n}!`,
  },
  uk: {
    heading: (n) => `Дякуємо, ${n}!`,
    body: "Ми сподіваємося, що Ваш відпочинок в <strong>Apartments Flora</strong> був сповнений морським бризом, теплим сонцем та незабутніми моментами. Сонячні тераси та шум моря чекатимуть на Ваше повернення.",
    reviewAsk: "Якщо Вам сподобалось, ми будемо щиро вдячні за відгук у Google &mdash; він допомагає іншим мандрівникам знайти нас.",
    reviewBtn: "Залишити відгук",
    closing: "Щасливої дороги та до зустрічі!",
    subject: (n) => `Дякуємо за Ваш відпочинок, ${n}!`,
  },
  no: {
    heading: (n) => `Takk, ${n}!`,
    body: "Vi håper oppholdet ditt på <strong>Apartments Flora</strong> var fylt med havbris, varmt solskinn og øyeblikk du vil huske. De solrike terrassene og lyden av havet vil vente på deg ved din tilbakekomst.",
    reviewAsk: "Hvis du likte opplevelsen, ville vi vært veldig takknemlige for en anmeldelse på Google &mdash; det hjelper andre reisende å oppdage oss.",
    reviewBtn: "Legg igjen en anmeldelse",
    closing: "God reise og vi sees igjen snart!",
    subject: (n) => `Takk for oppholdet, ${n}!`,
  },
};

const waI18n: Record<GuestLang, WhatsAppStrings> = {
  en: {
    welcomeGreeting: (n) => `Hello ${n}!`,
    welcomeConfirmed: "Your reservation at *Apartments Flora* is confirmed:",
    welcomeRoom: "Room",
    welcomeCheckin: "Check-in",
    welcomeCheckout: "Check-out",
    welcomeNights: "Nights",
    welcomeTotal: "Total",
    welcomeClosing: "We're looking forward to welcoming you!\n— The Flora Team",
    farewellGreeting: (n) => `Thank you for staying with us, ${n}!`,
    farewellBody: "We hope you enjoyed your time at *Apartments Flora* in Burgas.",
    farewellReviewAsk: "If you have a moment, we'd love a Google review:",
    farewellClosing: "Safe travels and see you again soon!\n— The Flora Team",
  },
  bg: {
    welcomeGreeting: (n) => `Здравейте, ${n}!`,
    welcomeConfirmed: "Вашата резервация в *Apartments Flora* е потвърдена:",
    welcomeRoom: "Стая",
    welcomeCheckin: "Настаняване",
    welcomeCheckout: "Напускане",
    welcomeNights: "Нощувки",
    welcomeTotal: "Обща сума",
    welcomeClosing: "Очакваме Ви с нетърпение!\n— Екипът на Flora",
    farewellGreeting: (n) => `Благодарим Ви за престоя, ${n}!`,
    farewellBody: "Надяваме се, че се насладихте на времето си в *Apartments Flora* в Бургас.",
    farewellReviewAsk: "Ако имате минутка, ще се радваме на отзив в Google:",
    farewellClosing: "Лек път и до скоро!\n— Екипът на Flora",
  },
  de: {
    welcomeGreeting: (n) => `Hallo ${n}!`,
    welcomeConfirmed: "Ihre Reservierung bei *Apartments Flora* ist bestätigt:",
    welcomeRoom: "Zimmer",
    welcomeCheckin: "Check-in",
    welcomeCheckout: "Check-out",
    welcomeNights: "Nächte",
    welcomeTotal: "Gesamt",
    welcomeClosing: "Wir freuen uns auf Ihren Besuch!\n— Das Flora Team",
    farewellGreeting: (n) => `Vielen Dank für Ihren Aufenthalt, ${n}!`,
    farewellBody: "Wir hoffen, Sie haben Ihre Zeit bei *Apartments Flora* in Burgas genossen.",
    farewellReviewAsk: "Wenn Sie einen Moment haben, freuen wir uns über eine Google-Bewertung:",
    farewellClosing: "Gute Reise und bis bald!\n— Das Flora Team",
  },
  fr: {
    welcomeGreeting: (n) => `Bonjour ${n} !`,
    welcomeConfirmed: "Votre réservation à *Apartments Flora* est confirmée :",
    welcomeRoom: "Chambre",
    welcomeCheckin: "Arrivée",
    welcomeCheckout: "Départ",
    welcomeNights: "Nuits",
    welcomeTotal: "Total",
    welcomeClosing: "Nous avons hâte de vous accueillir !\n— L'équipe Flora",
    farewellGreeting: (n) => `Merci pour votre séjour, ${n} !`,
    farewellBody: "Nous espérons que vous avez apprécié votre séjour à *Apartments Flora* à Burgas.",
    farewellReviewAsk: "Si vous avez un moment, un avis Google nous ferait très plaisir :",
    farewellClosing: "Bon voyage et à bientôt !\n— L'équipe Flora",
  },
  ru: {
    welcomeGreeting: (n) => `Здравствуйте, ${n}!`,
    welcomeConfirmed: "Ваша бронь в *Apartments Flora* подтверждена:",
    welcomeRoom: "Номер",
    welcomeCheckin: "Заезд",
    welcomeCheckout: "Выезд",
    welcomeNights: "Ночей",
    welcomeTotal: "Итого",
    welcomeClosing: "Ждём Вас с нетерпением!\n— Команда Flora",
    farewellGreeting: (n) => `Спасибо за Ваш отдых, ${n}!`,
    farewellBody: "Надеемся, Вам понравилось время в *Apartments Flora* в Бургасе.",
    farewellReviewAsk: "Если у Вас есть минутка, будем рады отзыву в Google:",
    farewellClosing: "Счастливого пути и до скорой встречи!\n— Команда Flora",
  },
  uk: {
    welcomeGreeting: (n) => `Вітаємо, ${n}!`,
    welcomeConfirmed: "Ваше бронювання в *Apartments Flora* підтверджено:",
    welcomeRoom: "Кімната",
    welcomeCheckin: "Заїзд",
    welcomeCheckout: "Виїзд",
    welcomeNights: "Ночей",
    welcomeTotal: "Разом",
    welcomeClosing: "Чекаємо на Вас з нетерпінням!\n— Команда Flora",
    farewellGreeting: (n) => `Дякуємо за Ваш відпочинок, ${n}!`,
    farewellBody: "Сподіваємося, Вам сподобався час в *Apartments Flora* у Бургасі.",
    farewellReviewAsk: "Якщо маєте хвилинку, будемо раді відгуку в Google:",
    farewellClosing: "Щасливої дороги та до зустрічі!\n— Команда Flora",
  },
  no: {
    welcomeGreeting: (n) => `Hei ${n}!`,
    welcomeConfirmed: "Din reservasjon hos *Apartments Flora* er bekreftet:",
    welcomeRoom: "Rom",
    welcomeCheckin: "Innsjekk",
    welcomeCheckout: "Utsjekk",
    welcomeNights: "Netter",
    welcomeTotal: "Totalt",
    welcomeClosing: "Vi gleder oss til å ønske deg velkommen!\n— Flora-teamet",
    farewellGreeting: (n) => `Takk for oppholdet, ${n}!`,
    farewellBody: "Vi håper du koste deg hos *Apartments Flora* i Burgas.",
    farewellReviewAsk: "Hvis du har et øyeblikk, setter vi stor pris på en Google-anmeldelse:",
    farewellClosing: "God reise og vi sees igjen snart!\n— Flora-teamet",
  },
};

/**
 * Selling display names — used ONLY in guest-facing emails & WhatsApp.
 * Nowhere else in StayPilot should reference these; the system uses room codes.
 */
// Keys are the NEW canonical room codes that match Beds24 1-to-1 with an
// entrance-number prefix (41 = Ivan Bogorov 41, 39 = Ivan Bogorov 39).
// The ground-floor apartment with Beds24 label "Двустаен партер" has no
// numeric prefix — its code is the Bulgarian label verbatim.
const ROOM_DISPLAY_NAMES: Record<string, string> = {
  "41.4.2":         "The Horizon",
  "41.3":           "The Lookout",
  "41.2":           "Sea Glimpse",
  "41.4.1":         "The Sunset",
  "41-2":           "Corner Suite",
  "41.1.2":         "Golden Morning",
  "41.1.1":         "Orchid Balcony",
  "41.0.1":         "The Birdsong",
  "Двустаен партер":"Garden Apartment",
  "39.2.4.2":       "The Lantern",
  "39.2.4.3":       "Afternoon Sun",
  "39.2.4.1":       "Poppy Apartment",
  "39.1.5":         "The Quartet",
  "39.1.3":         "Tulip Studio",
  "39.1.3а":        "Green Canopy",
  "39.0.1":         "Welcome Garden",
  "39.2.5":         "Park Gate",
  "39.5.5":         "Morning Light",
};

/** Resolve room code → selling name for emails. Falls back to code if unknown. */
function displayRoom(code: string): string {
  return ROOM_DISPLAY_NAMES[code] || code;
}

/* ── Welcome (booking confirmation) ──────────────────────────────────────── */
export function welcomeEmailHtml(d: TemplateData): string {
  const lang = d.lang || "en";
  const t = welcomeI18n[lang] || welcomeI18n.en;

  // Compute deposit = 50% of total (strip € sign, parse number)
  const totalNum = parseFloat(d.total.replace(/[^0-9.]/g, "")) || 0;
  const depositAmt = Math.ceil(totalNum / 2);
  const depositRef = t.depositRef(d.roomCode, d.checkin, d.checkout);
  const guestLine = d.children > 0 ? `${d.guests} + ${d.children}` : `${d.guests}`;
  const hasNotes = d.notes && d.notes.trim().length > 0;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1e2e;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1e2e;padding:40px 20px">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Gold top accent line -->
  <tr><td style="height:4px;background:linear-gradient(90deg,#C9A84C,#e8d48b,#C9A84C);border-radius:12px 12px 0 0"></td></tr>

  <!-- Header -->
  <tr><td style="background:#122943;padding:36px 40px 28px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.25)">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#C9A84C;font-family:Georgia,serif">&#9670; Apartments Flora &#9670;</p>
    <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,253,248,0.5);font-family:Georgia,serif">Burgas &bull; Black Sea Coast</p>
  </td></tr>

  <!-- Main body -->
  <tr><td style="background:#fffdf8;padding:44px 44px 20px">

    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#122943;font-family:Georgia,serif;text-align:center">${t.heading}</h1>
    <div style="width:50px;height:2px;background:#C9A84C;margin:0 auto 28px"></div>

    <p style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#4a5e6e;text-align:center;font-family:Georgia,serif">${t.intro(esc(d.guestName))}</p>

    <!-- Reservation details card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;border-radius:10px;border:1px solid rgba(201,168,76,0.2);margin:0 0 28px">
      <tr><td style="padding:24px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;width:40%">${t.room}</td>
            <td style="padding:10px 0;font-size:16px;font-weight:700;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${esc(displayRoom(d.roomCode))}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif">${t.checkin}</td>
            <td style="padding:10px 0;font-size:15px;font-weight:600;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${esc(d.checkin)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif">${t.checkout}</td>
            <td style="padding:10px 0;font-size:15px;font-weight:600;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${esc(d.checkout)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif">${t.nights}</td>
            <td style="padding:10px 0;font-size:15px;font-weight:600;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${d.nights}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif">${t.guests}</td>
            <td style="padding:10px 0;font-size:15px;font-weight:600;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${guestLine}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif">${t.arrival}</td>
            <td style="padding:10px 0;font-size:15px;font-weight:600;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${esc(d.arrivalTime)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif">${t.departure}</td>
            <td style="padding:10px 0;font-size:15px;font-weight:600;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${esc(d.departTime)}</td>
          </tr>${d.cots > 0 ? `
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif">${t.cots}</td>
            <td style="padding:10px 0;font-size:15px;font-weight:600;color:#122943;border-bottom:1px solid rgba(201,168,76,0.15);font-family:Georgia,serif;text-align:right">${d.cots} &times; &euro;25</td>
          </tr>` : ``}
          <tr>
            <td style="padding:14px 0 4px;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;font-family:Georgia,serif">${t.total}</td>
            <td style="padding:14px 0 4px;font-size:22px;font-weight:700;color:#C9A84C;font-family:Georgia,serif;text-align:right">${esc(d.total)}</td>
          </tr>${hasNotes ? `
          <tr>
            <td colspan="2" style="padding:14px 0 4px;border-top:1px solid rgba(201,168,76,0.15)">
              <p style="margin:0 0 4px;font-size:13px;color:#8a9aab;text-transform:uppercase;letter-spacing:1px;font-family:Georgia,serif">${t.specialRequests}</p>
              <p style="margin:0;font-size:14px;font-weight:600;color:#122943;font-family:Georgia,serif;line-height:1.6">${esc(d.notes!)}</p>
            </td>
          </tr>` : ``}
        </table>
      </td></tr>
    </table>

    <!-- ══ DEPOSIT / КАПАРО section ══ -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px">
      <tr><td>

        <!-- Important banner — dark navy card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1e2e;border-radius:12px;overflow:hidden">
          <tr><td style="padding:28px 28px 24px;text-align:center">
            <p style="margin:0 0 10px;font-size:16px;font-weight:700;font-style:italic;color:#C9A84C;font-family:Georgia,serif;letter-spacing:1px">${t.depositImportant}</p>
            <p style="margin:0 0 6px;font-size:14px;line-height:1.7;color:rgba(255,253,248,0.85);font-family:Georgia,serif">${t.depositMsg(String(depositAmt))}</p>
            <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(255,253,248,0.65);font-family:Georgia,serif">${t.depositWithin}</p>
          </td></tr>
        </table>

        <!-- Bank details card — white with navy accents -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf8;border:1px solid rgba(201,168,76,0.25);border-radius:0 0 12px 12px;border-top:none">
          <tr><td style="padding:20px 28px 8px">
            <p style="margin:0 0 4px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#C9A84C;font-family:Georgia,serif">${t.depositBankTitle}</p>
          </td></tr>

          <!-- Recipient -->
          <tr><td style="padding:8px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;border-radius:8px;border:1px solid rgba(201,168,76,0.15)">
              <tr><td style="padding:12px 16px">
                <p style="margin:0 0 4px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a9aab;font-family:Georgia,serif">${t.depositRecipientLabel}</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#122943;font-family:Georgia,serif">${t.depositRecipient}</p>
              </td></tr>
            </table>
          </td></tr>

          <!-- IBAN -->
          <tr><td style="padding:8px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;border-radius:8px;border:1px solid rgba(201,168,76,0.15)">
              <tr><td style="padding:12px 16px">
                <p style="margin:0 0 4px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a9aab;font-family:Georgia,serif">${t.depositIbanLabel}</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:#122943;font-family:monospace,Georgia,serif;letter-spacing:0.5px">BG47STSA93000010588249</p>
              </td></tr>
            </table>
          </td></tr>

          <!-- Amount -->
          <tr><td style="padding:8px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;border-radius:8px;border:1px solid rgba(201,168,76,0.15)">
              <tr>
                <td style="padding:12px 16px">
                  <p style="margin:0 0 4px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#C9A84C;font-family:Georgia,serif">${t.depositAmountLabel}</p>
                  <p style="margin:0;font-size:11px;color:#8a9aab;font-family:Georgia,serif">${t.depositAmountFrom(String(totalNum))}</p>
                </td>
                <td style="padding:12px 16px;text-align:right;vertical-align:middle">
                  <p style="margin:0;font-size:24px;font-weight:700;color:#C9A84C;font-family:Georgia,serif">&euro;${depositAmt}</p>
                </td>
              </tr>
            </table>
          </td></tr>

          <!-- Reference -->
          <tr><td style="padding:8px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;border-radius:8px;border:1px solid rgba(201,168,76,0.15)">
              <tr><td style="padding:12px 16px">
                <p style="margin:0 0 4px;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a9aab;font-family:Georgia,serif">${t.depositRefLabel}</p>
                <p style="margin:0;font-size:14px;font-weight:600;color:#122943;font-family:Georgia,serif">${depositRef}</p>
              </td></tr>
            </table>
          </td></tr>

          <!-- Note -->
          <tr><td style="padding:12px 28px 20px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,168,76,0.08);border-radius:8px;border:1px solid rgba(201,168,76,0.15)">
              <tr><td style="padding:14px 16px">
                <p style="margin:0;font-size:12px;line-height:1.7;color:#4a5e6e;font-family:Georgia,serif">${t.depositNote}</p>
              </td></tr>
            </table>
          </td></tr>

          <!-- Late check-in warning -->
          <tr><td style="padding:0 28px 20px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f0;border-radius:8px;border:1px solid rgba(180,40,40,0.25)">
              <tr><td style="padding:14px 16px">
                <p style="margin:0;font-size:12px;line-height:1.7;color:#8b1a1a;font-weight:700;font-family:Georgia,serif">${t.lateCheckinWarning}</p>
              </td></tr>
            </table>
          </td></tr>

        </table>

      <!-- ══ v1.2 ARRIVAL AMENITIES (EV + parking) ══ -->
      ${t.evTitle ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-left:4px solid #3b82f6;border-radius:8px;margin:0 0 28px">
        <tr><td style="padding:16px 20px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1e40af;font-family:Georgia,serif">${t.evTitle}</p>
          <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6;color:#1e3a5f;font-family:Georgia,serif">${t.evText}</p>
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#1e40af;font-family:Georgia,serif">${t.parkingTitle}</p>
          <p style="margin:0;font-size:13.5px;line-height:1.6;color:#1e3a5f;font-family:Georgia,serif">${d.parking ? t.parkingSelected : t.parkingFallback}</p>
        </td></tr>
      </table>` : ``}

      <!-- ══ SELF CHECK-IN INSTRUCTIONS (shown for late arrivals ≥ 18:00) ══ -->
      ${d.arrivalTime >= "18:00" ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px">
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#122943;border-radius:12px;overflow:hidden">
            <tr><td style="padding:28px 28px 12px;text-align:center">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#C9A84C;font-family:Georgia,serif">&#9670; &#9670; &#9670;</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#fffdf8;font-family:Georgia,serif">${t.selfCheckinTitle}</p>
            </td></tr>
            <tr><td style="padding:0 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:12px 0;border-bottom:1px solid rgba(201,168,76,0.15)">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td style="width:32px;vertical-align:top"><div style="width:28px;height:28px;border-radius:50%;background:#C9A84C;color:#122943;font-size:14px;font-weight:700;text-align:center;line-height:28px;font-family:Georgia,serif">1</div></td>
                    <td style="padding:4px 0 0 12px;font-size:14px;color:rgba(255,253,248,0.85);font-family:Georgia,serif;line-height:1.6">${t.selfCheckinStep1}</td>
                  </tr></table>
                </td></tr>
                <tr><td style="padding:12px 0;border-bottom:1px solid rgba(201,168,76,0.15)">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td style="width:32px;vertical-align:top"><div style="width:28px;height:28px;border-radius:50%;background:#C9A84C;color:#122943;font-size:14px;font-weight:700;text-align:center;line-height:28px;font-family:Georgia,serif">2</div></td>
                    <td style="padding:4px 0 0 12px;font-size:14px;color:rgba(255,253,248,0.85);font-family:Georgia,serif;line-height:1.6">${t.selfCheckinStep2}<br/><span style="font-size:20px;font-weight:700;color:#C9A84C;letter-spacing:2px;font-family:monospace">____</span></td>
                  </tr></table>
                </td></tr>
                <tr><td style="padding:12px 0;border-bottom:1px solid rgba(201,168,76,0.15)">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td style="width:32px;vertical-align:top"><div style="width:28px;height:28px;border-radius:50%;background:#C9A84C;color:#122943;font-size:14px;font-weight:700;text-align:center;line-height:28px;font-family:Georgia,serif">3</div></td>
                    <td style="padding:4px 0 0 12px;font-size:14px;color:rgba(255,253,248,0.85);font-family:Georgia,serif;line-height:1.6">${t.selfCheckinStep3}<br/><span style="font-size:20px;font-weight:700;color:#C9A84C;letter-spacing:2px;font-family:monospace">____</span></td>
                  </tr></table>
                </td></tr>
                <tr><td style="padding:12px 0;border-bottom:1px solid rgba(201,168,76,0.15)">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td style="width:32px;vertical-align:top"><div style="width:28px;height:28px;border-radius:50%;background:#C9A84C;color:#122943;font-size:14px;font-weight:700;text-align:center;line-height:28px;font-family:Georgia,serif">4</div></td>
                    <td style="padding:4px 0 0 12px;font-size:14px;color:rgba(255,253,248,0.85);font-family:Georgia,serif;line-height:1.6">${t.selfCheckinStep4}</td>
                  </tr></table>
                </td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:16px 28px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,168,76,0.12);border-radius:8px">
                <tr><td style="padding:12px 16px">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#C9A84C;font-family:Georgia,serif">${t.selfCheckinWifi}</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#fffdf8;font-family:monospace,Georgia,serif;letter-spacing:0.5px">Flora_Guest / ____</p>
                </td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:0 28px 24px;text-align:center">
              <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(255,253,248,0.65);font-family:Georgia,serif">${t.selfCheckinContact}</p>
            </td></tr>
          </table>
        </td></tr>
      </table>` : ``}

      </td></tr>
    </table>

    <p style="margin:0 0 10px;font-size:15px;line-height:1.8;color:#4a5e6e;text-align:center;font-style:italic;font-family:Georgia,serif">${t.closing}</p>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#122943;padding:28px 40px;text-align:center;border-top:1px solid rgba(201,168,76,0.25);border-radius:0 0 12px 12px">
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#C9A84C;font-family:Georgia,serif">The Flora Team</p>
    <p style="margin:0;font-size:11px;color:rgba(255,253,248,0.4);font-family:Georgia,serif">&copy; ${new Date().getFullYear()} Apartments Flora &bull; Burgas, Bulgaria</p>
  </td></tr>

  <!-- Gold bottom accent line -->
  <tr><td style="height:4px;background:linear-gradient(90deg,#C9A84C,#e8d48b,#C9A84C);border-radius:0 0 12px 12px"></td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export function welcomeEmailSubject(guestName: string, lang: GuestLang = "en"): string {
  const t = welcomeI18n[lang] || welcomeI18n.en;
  return t.subject(guestName);
}

/* ── Caparo (deposit) reminder — focused single-purpose email ────────────── */
//
// Sent manually from StayPilot when staff want to nudge a guest whose
// 24-hour deposit window is approaching or has passed without payment.
// Strips out the welcome niceties (no full reservation details card,
// no self-check-in instructions, no EV/parking) and shows ONLY:
//   • A friendly headline + deposit-overdue body
//   • The bank-transfer card (recipient, IBAN, amount, payment reference)
//   • The "must be received in 24h or voided" warning
//
// Reuses existing welcomeI18n.depositXxx strings — all 7 languages already
// done, no duplication. Subject line is a separate i18n table below.
const caparoReminderSubjectI18n: Record<GuestLang, (n: string) => string> = {
  en: (n) => `Reminder · Deposit pending · Apartments Flora`,
  bg: (n) => `Напомняне · Капаро в очакване · Apartments Flora`,
  de: (n) => `Erinnerung · Anzahlung ausstehend · Apartments Flora`,
  fr: (n) => `Rappel · Acompte en attente · Apartments Flora`,
  ru: (n) => `Напоминание · Задаток ожидается · Apartments Flora`,
  uk: (n) => `Нагадування · Завдаток очікується · Apartments Flora`,
  no: (n) => `Påminnelse · Depositum venter · Apartments Flora`,
};

const caparoReminderHeadlineI18n: Record<GuestLang, string> = {
  en: "Friendly reminder about your deposit",
  bg: "Приятелско напомняне за капарото",
  de: "Freundliche Erinnerung an Ihre Anzahlung",
  fr: "Rappel amical concernant votre acompte",
  ru: "Дружеское напоминание о вашем задатке",
  uk: "Дружнє нагадування про ваш завдаток",
  no: "Vennlig påminnelse om ditt depositum",
};

const caparoReminderIntroI18n: Record<GuestLang, (n: string) => string> = {
  en: (n) => `Dear ${n}, this is a friendly reminder that the deposit for your reservation has not yet reached our bank account. To keep your booking, please complete the transfer using the details below.`,
  bg: (n) => `Уважаеми ${n}, напомняме Ви, че капарото за Вашата резервация все още не е постъпило по банковата ни сметка. За да запазим резервацията Ви, моля направете превода с данните по-долу.`,
  de: (n) => `Lieber ${n}, dies ist eine freundliche Erinnerung, dass die Anzahlung für Ihre Reservierung noch nicht bei uns eingegangen ist. Damit Ihre Buchung bestehen bleibt, überweisen Sie bitte den Betrag mit den unten angegebenen Daten.`,
  fr: (n) => `Cher ${n}, ceci est un rappel amical : l'acompte pour votre réservation n'est pas encore arrivé sur notre compte bancaire. Pour conserver votre réservation, veuillez effectuer le virement avec les coordonnées ci-dessous.`,
  ru: (n) => `Уважаемый ${n}, дружеское напоминание: задаток за ваше бронирование ещё не поступил на наш банковский счёт. Чтобы сохранить бронирование, пожалуйста, выполните перевод по данным ниже.`,
  uk: (n) => `Шановний ${n}, дружнє нагадування: завдаток за ваше бронювання ще не надійшов на наш банківський рахунок. Щоб зберегти бронювання, будь ласка, виконайте переказ за реквізитами нижче.`,
  no: (n) => `Kjære ${n}, dette er en vennlig påminnelse om at depositumet for reservasjonen din ennå ikke er mottatt på vår bankkonto. For å beholde bookingen din, vennligst gjennomfør overføringen med detaljene nedenfor.`,
};

export function caparoReminderEmailSubject(guestName: string, lang: GuestLang = "en"): string {
  const fn = caparoReminderSubjectI18n[lang] || caparoReminderSubjectI18n.en;
  return fn(guestName);
}

export function caparoReminderEmailHtml(d: TemplateData): string {
  const lang = d.lang || "en";
  const t = welcomeI18n[lang] || welcomeI18n.en;
  const headline = caparoReminderHeadlineI18n[lang] || caparoReminderHeadlineI18n.en;
  const introFn  = caparoReminderIntroI18n[lang] || caparoReminderIntroI18n.en;

  const totalNum = parseFloat(d.total.replace(/[^0-9.]/g, "")) || 0;
  const depositAmt = Math.ceil(totalNum / 2);
  const depositRef = t.depositRef(d.roomCode, d.checkin, d.checkout);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1e2e;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1e2e;padding:40px 20px">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Gold top accent -->
  <tr><td style="height:4px;background:linear-gradient(90deg,#C9A84C,#e8d48b,#C9A84C);border-radius:12px 12px 0 0"></td></tr>

  <!-- Header -->
  <tr><td style="background:#122943;padding:36px 40px 28px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.25)">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#C9A84C;font-family:Georgia,serif">&#9670; Apartments Flora &#9670;</p>
    <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,253,248,0.5);font-family:Georgia,serif">Burgas &bull; Black Sea Coast</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fffdf8;padding:44px 44px 20px">

    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#122943;font-family:Georgia,serif;text-align:center">${headline}</h1>
    <div style="width:50px;height:2px;background:#C9A84C;margin:0 auto 28px"></div>

    <p style="margin:0 0 22px;font-size:15px;line-height:1.8;color:#4a5e6e;text-align:center;font-family:Georgia,serif">${introFn(esc(d.guestName))}</p>

    <!-- Booking ref strip -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;border-radius:10px;border:1px solid rgba(201,168,76,0.2);margin:0 0 24px">
      <tr><td style="padding:14px 22px;text-align:center">
        <p style="margin:0;font-size:12px;color:#8a9aab;text-transform:uppercase;letter-spacing:1.5px;font-family:Georgia,serif">${t.depositRefLabel}</p>
        <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#122943;font-family:Georgia,serif">${esc(depositRef)}</p>
      </td></tr>
    </table>

    <!-- ──────────── DEPOSIT (importance banner) ──────────── -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
      <tr><td style="background:#0f1e2e;border-radius:10px;border:1px solid #C9A84C;padding:24px 28px">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C9A84C;text-align:center;font-family:Georgia,serif">&#9670; ${t.depositImportant} &#9670;</p>
        <p style="margin:0 0 14px;font-size:16px;color:#fffdf8;text-align:center;font-family:Georgia,serif;line-height:1.6">${t.depositMsg(String(depositAmt))}</p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(255,253,248,0.65);font-family:Georgia,serif">${t.depositWithin}</p>
      </td></tr>
    </table>

    <!-- ──────────── BANK TRANSFER CARD ──────────── -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ed;border-radius:10px;border:1px solid rgba(201,168,76,0.2);margin:0 0 22px">
      <tr><td style="padding:24px 28px">
        <p style="margin:0 0 18px;font-size:12px;letter-spacing:2.5px;text-transform:uppercase;color:#C9A84C;text-align:center;font-family:Georgia,serif">${t.depositBankTitle}</p>

        <p style="margin:0 0 4px;font-size:11px;color:#8a9aab;text-transform:uppercase;letter-spacing:1.5px;font-family:Georgia,serif">${t.depositRecipientLabel}</p>
        <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#122943;font-family:Georgia,serif">${t.depositRecipient}</p>

        <p style="margin:0 0 4px;font-size:11px;color:#8a9aab;text-transform:uppercase;letter-spacing:1.5px;font-family:Georgia,serif">${t.depositIbanLabel}</p>
        <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#122943;font-family:'Courier New',monospace;letter-spacing:1px">BG47STSA93000010588249</p>

        <p style="margin:0 0 4px;font-size:11px;color:#8a9aab;text-transform:uppercase;letter-spacing:1.5px;font-family:Georgia,serif">${t.depositAmountLabel}</p>
        <p style="margin:0 0 4px;font-size:24px;font-weight:700;color:#C9A84C;font-family:Georgia,serif">&euro;${depositAmt}</p>
        <p style="margin:0 0 16px;font-size:11px;color:#8a9aab;font-family:Georgia,serif">${t.depositAmountFrom(esc(d.total.replace(/[^0-9.]/g, "")))}</p>

        <p style="margin:0 0 4px;font-size:11px;color:#8a9aab;text-transform:uppercase;letter-spacing:1.5px;font-family:Georgia,serif">${t.depositRefLabel}</p>
        <p style="margin:0;font-size:13px;font-weight:600;color:#122943;font-family:'Courier New',monospace;background:#fff;padding:8px 12px;border-radius:6px;border:1px dashed rgba(201,168,76,0.4)">${esc(depositRef)}</p>
      </td></tr>
    </table>

    <!-- Closing -->
    <p style="margin:18px 0 8px;font-size:14px;line-height:1.7;color:#4a5e6e;text-align:center;font-family:Georgia,serif;font-style:italic">${t.closing}</p>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#122943;padding:24px 40px;text-align:center;border-top:1px solid rgba(201,168,76,0.25);border-radius:0 0 12px 12px">
    <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:rgba(255,253,248,0.5);font-family:Georgia,serif">Apartments Flora &bull; Burgas, Bulgaria</p>
    <p style="margin:6px 0 0;font-size:11px;color:rgba(255,253,248,0.4);font-family:Georgia,serif">studioflora2017@gmail.com &bull; +359 886 512 205</p>
  </td></tr>

</table>

</td></tr>
</table>
</body></html>`;
}

/* ── Farewell (departure + Google review) ────────────────────────────────── */
export function farewellEmailHtml(d: TemplateData): string {
  const lang = d.lang || "en";
  const t = farewellI18n[lang] || farewellI18n.en;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1e2e;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1e2e;padding:40px 20px">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Gold top accent line -->
  <tr><td style="height:4px;background:linear-gradient(90deg,#C9A84C,#e8d48b,#C9A84C);border-radius:12px 12px 0 0"></td></tr>

  <!-- Header -->
  <tr><td style="background:#122943;padding:36px 40px 28px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.25)">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#C9A84C;font-family:Georgia,serif">&#9670; Apartments Flora &#9670;</p>
    <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,253,248,0.5);font-family:Georgia,serif">Burgas &bull; Black Sea Coast</p>
  </td></tr>

  <!-- Main body -->
  <tr><td style="background:#fffdf8;padding:44px 44px 20px">

    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#122943;font-family:Georgia,serif;text-align:center">${t.heading(esc(d.guestName))}</h1>
    <div style="width:50px;height:2px;background:#C9A84C;margin:0 auto 28px"></div>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#4a5e6e;text-align:center;font-family:Georgia,serif">${t.body}</p>

    <!-- Decorative divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr>
        <td style="width:40%;border-bottom:1px solid rgba(201,168,76,0.3)">&nbsp;</td>
        <td style="text-align:center;color:#C9A84C;font-size:16px;padding:0 12px">&#10038;</td>
        <td style="width:40%;border-bottom:1px solid rgba(201,168,76,0.3)">&nbsp;</td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#4a5e6e;text-align:center;font-family:Georgia,serif">${t.reviewAsk}</p>

    <!-- Review CTA button -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px">
      <tr><td style="border-radius:999px;background:#C9A84C;box-shadow:0 4px 16px rgba(201,168,76,0.35)">
        <a href="${GOOGLE_REVIEW_URL}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:Georgia,serif;font-size:15px;font-weight:700;color:#0f1e2e;text-decoration:none;letter-spacing:0.5px">${t.reviewBtn} &rarr;</a>
      </td></tr>
    </table>

    <p style="margin:0 0 10px;font-size:15px;line-height:1.8;color:#4a5e6e;text-align:center;font-style:italic;font-family:Georgia,serif">${t.closing}</p>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#122943;padding:28px 40px;text-align:center;border-top:1px solid rgba(201,168,76,0.25);border-radius:0 0 12px 12px">
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#C9A84C;font-family:Georgia,serif">The Flora Team</p>
    <p style="margin:0;font-size:11px;color:rgba(255,253,248,0.4);font-family:Georgia,serif">&copy; ${new Date().getFullYear()} Apartments Flora &bull; Burgas, Bulgaria</p>
  </td></tr>

  <!-- Gold bottom accent line -->
  <tr><td style="height:4px;background:linear-gradient(90deg,#C9A84C,#e8d48b,#C9A84C);border-radius:0 0 12px 12px"></td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export function farewellEmailSubject(guestName: string, lang: GuestLang = "en"): string {
  const t = farewellI18n[lang] || farewellI18n.en;
  return t.subject(guestName);
}

/* ── WhatsApp message builders (wa.me click-to-chat) ─────────────────────── */
export function welcomeWhatsAppText(d: TemplateData): string {
  const lang = d.lang || "en";
  const t = waI18n[lang] || waI18n.en;
  return [
    t.welcomeGreeting(d.guestName),
    ``,
    t.welcomeConfirmed,
    `${t.welcomeRoom}: ${displayRoom(d.roomCode)}`,
    `${t.welcomeCheckin}: ${d.checkin} — ${d.arrivalTime}`,
    `${t.welcomeCheckout}: ${d.checkout} — ${d.departTime}`,
    `${t.welcomeNights}: ${d.nights}`,
    `${t.welcomeTotal}: ${d.total}`,
    ``,
    t.welcomeClosing,
  ].join("\n");
}

export function farewellWhatsAppText(d: TemplateData): string {
  const lang = d.lang || "en";
  const t = waI18n[lang] || waI18n.en;
  return [
    t.farewellGreeting(d.guestName),
    ``,
    t.farewellBody,
    ``,
    t.farewellReviewAsk,
    GOOGLE_REVIEW_URL,
    ``,
    t.farewellClosing,
  ].join("\n");
}

export function whatsappLink(phone: string, text: string): string {
  // Strip everything except digits and leading +
  const cleaned = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

/* ── v1.2 C2: Caparo auto-cancel email ────────────────────────────────────
 * Sent automatically when a confirmed reservation has no caparo after 36h.
 * The booking has already been flipped to CANCELLED in the DB and pushed
 * to Beds24 (freeing the dates on Booking.com/Airbnb). This is the guest
 * notification — apology + invitation to re-book.
 * Per-language copy kept simple so translation review is easy.
 */
interface CaparoCancelStrings {
  subject: (name: string) => string;
  heading: string;
  greeting: (name: string) => string;
  body1: string;
  body2: string;
  closing: string;
  team: string;
  rebookCta: string;
  rebookUrl: string;
}

const caparoCancelI18n: Record<GuestLang, CaparoCancelStrings> = {
  en: {
    subject: (n) => `Your reservation at Apartments Flora has been cancelled, ${n}`,
    heading: "Reservation cancelled",
    greeting: (n) => `Dear ${n},`,
    body1: "We regret to inform you that, because the deposit was not received within 24&nbsp;hours of your booking, your reservation at <strong>Apartments Flora</strong> has been cancelled automatically.",
    body2: "The dates are now released. If you still wish to stay with us, you are very welcome to book again &mdash; we&rsquo;d be delighted to host you.",
    closing: "Thank you for your understanding.",
    team: "The Flora Team",
    rebookCta: "Book again",
    rebookUrl: "https://apartmentsflora.com/",
  },
  bg: {
    subject: (n) => `Вашата резервация в Apartments Flora е анулирана, ${n}`,
    heading: "Резервацията е анулирана",
    greeting: (n) => `Скъпи/а ${n},`,
    body1: "С&nbsp;настоящото Ви уведомяваме, че поради неполучено капаро в&nbsp;срок от&nbsp;24&nbsp;часа, Вашата резервация в&nbsp;<strong>Apartments Flora</strong> беше анулирана автоматично.",
    body2: "Датите вече са освободени. Ако все още желаете да бъдете наш гост, каним Ви да направите нова резервация &mdash; ще се радваме да Ви посрещнем.",
    closing: "Благодарим за разбирането.",
    team: "Екипът на Flora",
    rebookCta: "Резервирай отново",
    rebookUrl: "https://apartmentsflora.com/",
  },
  de: {
    subject: (n) => `Ihre Reservierung bei Apartments Flora wurde storniert, ${n}`,
    heading: "Reservierung storniert",
    greeting: (n) => `Liebe/r ${n},`,
    body1: "Leider m&uuml;ssen wir Ihnen mitteilen, dass Ihre Reservierung bei <strong>Apartments Flora</strong> automatisch storniert wurde, da die Anzahlung nicht innerhalb von 24&nbsp;Stunden nach der Buchung bei uns eingegangen ist.",
    body2: "Die Daten sind jetzt wieder verf&uuml;gbar. Wenn Sie weiterhin bei uns &uuml;bernachten m&ouml;chten, sind Sie herzlich eingeladen, erneut zu buchen.",
    closing: "Danke f&uuml;r Ihr Verst&auml;ndnis.",
    team: "Das Flora Team",
    rebookCta: "Erneut buchen",
    rebookUrl: "https://apartmentsflora.com/",
  },
  fr: {
    subject: (n) => `Votre r&eacute;servation aux Apartments Flora a &eacute;t&eacute; annul&eacute;e, ${n}`,
    heading: "R&eacute;servation annul&eacute;e",
    greeting: (n) => `Cher/Ch&egrave;re ${n},`,
    body1: "Nous avons le regret de vous informer que, l&rsquo;acompte n&rsquo;ayant pas &eacute;t&eacute; re&ccedil;u dans les 24&nbsp;heures suivant votre r&eacute;servation, votre r&eacute;servation aux <strong>Apartments Flora</strong> a &eacute;t&eacute; automatiquement annul&eacute;e.",
    body2: "Les dates sont &agrave; nouveau disponibles. Si vous souhaitez toujours s&eacute;journer chez nous, n&rsquo;h&eacute;sitez pas &agrave; r&eacute;server &agrave; nouveau.",
    closing: "Merci de votre compr&eacute;hension.",
    team: "L&rsquo;&eacute;quipe Flora",
    rebookCta: "R&eacute;server &agrave; nouveau",
    rebookUrl: "https://apartmentsflora.com/",
  },
  ru: {
    subject: (n) => `Ваше бронирование в Apartments Flora отменено, ${n}`,
    heading: "Бронирование отменено",
    greeting: (n) => `Уважаемый/ая ${n},`,
    body1: "С&nbsp;сожалением сообщаем, что, поскольку задаток не&nbsp;поступил в&nbsp;течение 24&nbsp;часов с&nbsp;момента бронирования, Ваше бронирование в&nbsp;<strong>Apartments Flora</strong> было автоматически отменено.",
    body2: "Даты теперь свободны. Если Вы всё ещё хотите остановиться у&nbsp;нас, приглашаем Вас забронировать снова &mdash; будем рады принять Вас.",
    closing: "Благодарим за понимание.",
    team: "Команда Flora",
    rebookCta: "Забронировать снова",
    rebookUrl: "https://apartmentsflora.com/",
  },
  uk: {
    subject: (n) => `Ваше бронювання в Apartments Flora скасовано, ${n}`,
    heading: "Бронювання скасовано",
    greeting: (n) => `Шановний/а ${n},`,
    body1: "Зі шкодою повідомляємо, що оскільки завдаток не&nbsp;надійшов протягом 24&nbsp;годин з&nbsp;моменту бронювання, Ваше бронювання в&nbsp;<strong>Apartments Flora</strong> було автоматично скасовано.",
    body2: "Дати тепер вільні. Якщо Ви все ще бажаєте зупинитися в&nbsp;нас, запрошуємо забронювати знову &mdash; ми будемо раді прийняти Вас.",
    closing: "Дякуємо за розуміння.",
    team: "Команда Flora",
    rebookCta: "Забронювати знову",
    rebookUrl: "https://apartmentsflora.com/",
  },
  no: {
    subject: (n) => `Din reservasjon hos Apartments Flora er kansellert, ${n}`,
    heading: "Reservasjon kansellert",
    greeting: (n) => `Kj&aelig;re ${n},`,
    body1: "Vi m&aring; dessverre informere om at reservasjonen din hos <strong>Apartments Flora</strong> er blitt automatisk kansellert fordi depositumet ikke ble mottatt innen 24&nbsp;timer etter bestillingen.",
    body2: "Datoene er n&aring; frigjort. Hvis du fortsatt &oslash;nsker &aring; bo hos oss, er du hjertelig velkommen til &aring; bestille p&aring; nytt.",
    closing: "Takk for forst&aring;elsen.",
    team: "Flora-teamet",
    rebookCta: "Bestill igjen",
    rebookUrl: "https://apartmentsflora.com/",
  },
};

export function caparoCancelEmailSubject(guestName: string, lang: GuestLang = "en"): string {
  const t = caparoCancelI18n[lang] || caparoCancelI18n.en;
  return t.subject(guestName);
}

export function caparoCancelEmailHtml(guestName: string, lang: GuestLang = "en"): string {
  const t = caparoCancelI18n[lang] || caparoCancelI18n.en;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1e2e;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1e2e;padding:40px 20px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="height:4px;background:linear-gradient(90deg,#C9A84C,#e8d48b,#C9A84C);border-radius:12px 12px 0 0"></td></tr>
  <tr><td style="background:#122943;padding:36px 40px 28px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.25)">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#C9A84C">&#9670; Apartments Flora &#9670;</p>
    <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,253,248,0.5)">Burgas &bull; Black Sea Coast</p>
  </td></tr>
  <tr><td style="background:#fffdf8;padding:44px 44px 28px">
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#122943;text-align:center">${t.heading}</h1>
    <div style="width:50px;height:2px;background:#C9A84C;margin:0 auto 28px"></div>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#4a5e6e">${t.greeting(esc(guestName))}</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#4a5e6e">${t.body1}</p>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#4a5e6e">${t.body2}</p>
    <div style="text-align:center;margin:0 0 28px">
      <a href="${t.rebookUrl}" style="display:inline-block;background:#C9A84C;color:#122943;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;letter-spacing:.03em">${t.rebookCta}</a>
    </div>
    <p style="margin:0;font-size:15px;line-height:1.8;color:#4a5e6e;text-align:center;font-style:italic">${t.closing}</p>
  </td></tr>
  <tr><td style="background:#122943;padding:28px 40px;text-align:center;border-top:1px solid rgba(201,168,76,0.25);border-radius:0 0 12px 12px">
    <p style="margin:0;font-size:14px;font-weight:700;color:#C9A84C">${t.team}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ── helpers ──────────────────────────────────────────────────────────────── */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
