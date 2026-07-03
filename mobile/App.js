import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, Platform, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import Constants from 'expo-constants';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation/Navigation';
import { initDatabase, cleanupOrphans } from './src/database/db';
import { appAPI } from './src/services/api';

const STARTUP_TIPS = [
  'Druže, disciplina danas – ponos sutra.',
  'Radimo čvrsto, mislimo široko.',
  'Zajedno smo jači od svake prepreke.',
  'Bratstvo i jedinstvo – svaki dan, na djelu.',
  'Ne odustajemo: plan je plan.',
  'Udarnički tempo, mirna glava.',
  'Drugovi, rezultat je najbolji govor.',
  'Tko radi pošteno, spava mirno.',
  'Naprijed hrabro – bez puno priče.',
  'Kolektiv nosi, pojedinac blista.',
  'Čvrsta ruka, toplo srce.',
  'Red, rad i drugarstvo.',
  'Današnji trud je sutrašnja pobjeda.',
  'Nema “ne mogu” – ima “kako ćemo”.',
  'Dogovor drži kuću, rad gradi budućnost.',
  'Mi ne kukamo – mi rješavamo.',
  'Drž’ se plana, druže majstore.',
  'Svaki dan malo više – i ide.',
  'Čestit rad nema zamjenu.',
  'Zajedno u smjenu, zajedno u uspjeh.',
  'Tko zna – uči druge. Tko ne zna – pita.',
  'Odgovornost nije teret, nego čast.',
  'Nema prečaca do kvalitete.',
  'Drugarski stisak ruke – i idemo dalje.',
  'Glava hladna, srce vatreno, ruke vrijedne.',
  'Jedini način da radiš veliki posao jest da voliš ono što radiš.',
  'Uspjeh nije konačan, neuspjeh nije koban: važna je hrabrost da se nastavi dalje.',
  'Ne gledaj na sat; radi ono što on radi. Nastavi.',
  'Bilo da misliš da možeš ili da ne možeš – u pravu si.',
  'Vjeruj da možeš i već si na pola puta.',
  'Budućnost ovisi o onome što radiš danas.',
  'Ako prolaziš kroz pakao – samo nastavi.',
  'Radi što možeš, s onim što imaš, tamo gdje jesi.',
  'Uvijek izgleda nemoguće – dok se ne napravi.',
  'Ne dozvoli da ti jučer oduzme previše od danas.',
  'Težak rad pobjeđuje talent kad talent ne radi naporno.',
  'Promašiš 100% udaraca koje ne pokušaš.',
  'Najbolja osveta je ogroman uspjeh.',
  'Počni tamo gdje jesi. Iskoristi ono što imaš. Učini što možeš.',
  'Sanjaj veliko i usudi se ne uspjeti.',
  'Ne broji dane, učini da dani broje.',
  'Sve što možeš zamisliti – stvarno je.',
  'Nisam proizvod okolnosti, već vlastitih odluka.',
  'Ako želiš podići sebe, podigni nekog drugog.',
  'Uspjeh obično dolazi onima koji su previše zauzeti da bi ga tražili.',
  'Cilj bez plana samo je želja.',
  'Ponašaj se kao da tvoj postupak čini razliku. I čini.',
  'Što teže radiš za nešto, to se bolje osjećaš kad to postigneš.',
  'Ne daj da te vode strahovi u glavi, nego snovi u srcu.',
  'Ako prilika ne kuca – napravi vrata.',
  'Sedam puta padni, osmi put ustani.',
  'Ono što mislimo – to postajemo.',
  'Usred svake poteškoće leži prilika.',
  'Uspjeh je hodanje od neuspjeha do neuspjeha bez gubitka entuzijazma.',
  'Ne želim da bude lakše. Želim da ja budem bolji.',
  'Disciplina je jednaka slobodi.',
  'Ne možeš potrošiti kreativnost – što je više koristiš, više je imaš.',
  'Savršenstvo nije dostižno, ali ako ga tražimo, uhvatit ćemo izvrsnost.',
  'Prilike se ne događaju – ti ih stvaraš.',
  'Radi naporno u tišini, neka uspjeh stvori buku.',
  'Ako ne možeš letjeti – trči; ako ne možeš trčati – hodaj; ako ne možeš hodati – puži; ali što god radiš, nastavi se kretati naprijed.',
  'Velike stvari nikad ne dolaze iz zone komfora.',
  'Kvaliteta znači raditi ispravno i kad nitko ne gleda.',
  'Nije bitno jesi li pao – bitno je jesi li se ustao.',
  'Uspjeh je voljeti sebe, voljeti ono što radiš i kako to radiš.',
  'Motivacija te pokreće, ali navika te održava.',
  'Ne staj kad si umoran. Stani kad završiš.',
  'Guraj sebe, jer nitko drugi to neće učiniti za tebe.',
  'Tajna napretka je – početi.',
  'Snaga je u tome da vladaš vlastitim umom, a ne događajima izvana.',
  'Onaj tko pobijedi samoga sebe – najmoćniji je ratnik.',
  'Kad je nešto dovoljno važno, učini to čak i ako su šanse protiv tebe.',
  'Ako želiš veličinu, prestani tražiti dopuštenje.',
  'Čovjek koji pomiče planine počinje tako što odnosi male kamenčiće.',
  'Budi promjena koju želiš vidjeti u svijetu.',
  'Tvoje je vrijeme ograničeno – ne troši ga živeći tuđi život.',
  'Sreća nije nešto gotovo – dolazi iz tvojih vlastitih djela.',
  'Ne dopusti da buka tuđih mišljenja uguši tvoj unutarnji glas.',
  'Nastoj ne biti uspješan, nego koristan.',
  'Um je sve – ono što misliš, to postaješ.',
  'Hrabrost nije uvijek urlik. Ponekad je to tihi glas koji kaže: pokušat ću opet sutra.',
  'Ništa neće raditi – osim ako ne radiš ti.',
  'Postaješ ono u što vjeruješ.',
  'Živjeti – to je najrjeđa stvar na svijetu. Većina ljudi samo postoji.',
  'Učini svakog dana nešto što te plaši.',
  'Ne boj se odreći se dobrog da bi postigao veliko.',
  'Jedina osoba koju trebaš pokušati nadmašiti je ona koja si bio jučer.',
  'Uspjeh nije koliko si visoko popeo, nego koliko pozitivno utječeš na svijet.',
  'Tvoje ograničenje postoji samo u tvojoj mašti.',
  'Život je 10% ono što ti se dogodi, a 90% kako reagiraš.',
  'Nikada nisam sanjala o uspjehu – radila sam za njega.',
  'Ako želiš sretan život, veži ga uz cilj, a ne uz ljude ili stvari.',
  'Sve ima ljepotu, ali je ne vide svi.',
  'Ne moli za lagan život – moli za snagu da izdržiš težak.',
  'Budi ono što jesi – svi ostali su već zauzeti.',
  'Neuspjeh je samo prilika da ponovno počneš, ovaj put pametnije.',
  'Znanje ti daje moć, ali karakter donosi poštovanje.',
  'Mi smo ono što stalno radimo. Izvrsnost stoga nije čin, nego navika.',
  'Ako želiš ići brzo – idi sam; ako želiš ići daleko – idi s drugima.',
  'Ne ograničavaj svoje izazove – izazovi svoja ograničenja.',
  'Nije važno koliko sporo ideš – dokle god ne staješ.',
  'Način da počneš jest da prestaneš pričati i počneš raditi.',
  'Sve što si ikada želio nalazi se s druge strane straha.',
  'Uspjeh nije za lijene.',
  'Strah ubija više snova nego neuspjeh ikada hoće.',
  'Sumnja ubija više snova nego neuspjeh ikada hoće.',
  'Očekuj velike stvari od sebe – prije nego što ih učiniš.',
  'Ne ograničavaj se – ljudi se ograniče na ono što misle da mogu.',
  'Bol je privremena, ali odustajanje traje zauvijek.',
  'Ako možeš sanjati – možeš to i ostvariti.',
  'Nije važno što dobiješ ostvarivanjem ciljeva, već što postaneš dok ih ostvaruješ.',
  'Uspjeh je zbroj malih napora ponavljanih iz dana u dan.',
  'Ako nisi spreman riskirati uobičajeno, morat ćeš se zadovoljiti prosječnim.',
  'Ostani gladan. Ostani lud.',
  'Energija i upornost osvajaju sve stvari.',
  'Nisam propao – samo sam pronašao 10.000 načina koji ne rade.',
  'Učini svaki dan svojim remek-djelom.',
  'Ako želiš nešto što nikad nisi imao, moraš učiniti nešto što nikad nisi učinio.',
  'Pobjednik je sanjar koji nikada ne odustaje.',
  'Ne moraš biti velik da bi počeo, ali moraš početi da bi bio velik.',
  'Radi ono što u srcu osjećaš da je ispravno – ionako će te kritizirati.',
  'Snaga ne dolazi iz tjelesne sposobnosti, već iz neukrotive volje.',
  'Najbolji način da predvidiš budućnost jest da je stvoriš.',
  'Ne pričaj ljudima svoje planove – pokaži im rezultate.',
];

export default function App() {
  const [tip, setTip] = useState(null);
  const [showTip, setShowTip] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Lock portrait on startup (landscape unlocked only for signature modal)
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  useEffect(() => {
    // Inicijaliziraj bazu i očisti siročad servisa/popravaka bez dizala
    try {
      initDatabase();
      const result = cleanupOrphans();
      console.log(`🧹 Orphan cleanup done: services=${result.removedServices}, repairs=${result.removedRepairs}`);
    } catch (e) {
      console.log('⚠️ Orphan cleanup error:', e.message);
    }
  }, []);

  useEffect(() => {
    if (!STARTUP_TIPS.length) return;
    const randomIndex = Math.floor(Math.random() * STARTUP_TIPS.length);
    setTip(STARTUP_TIPS[randomIndex]);
    setShowTip(true);
    const timer = setTimeout(() => setShowTip(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const toVersionParts = (value) => String(value || '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);

    const compareVersion = (left, right) => {
      const a = toVersionParts(left);
      const b = toVersionParts(right);
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i += 1) {
        const av = a[i] || 0;
        const bv = b[i] || 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
      }
      return 0;
    };

    const openStore = async (storeUrl, packageName) => {
      const pkg = packageName || Constants?.expoConfig?.android?.package || 'hr.appel.elevators';
      const marketUrl = `market://details?id=${pkg}`;
      const webUrl = storeUrl || `https://play.google.com/store/apps/details?id=${pkg}`;

      try {
        if (Platform.OS === 'android') {
          const canOpenMarket = await Linking.canOpenURL(marketUrl);
          if (canOpenMarket) {
            await Linking.openURL(marketUrl);
            return;
          }
        }
        await Linking.openURL(webUrl);
      } catch (err) {
        Alert.alert('Greška', 'Ne mogu otvoriti Google Play stranicu.');
      }
    };

    const checkForUpdate = async () => {
      try {
        const response = await appAPI.getVersion();
        const info = response?.data || {};

        const latestVersion = info.latestVersion;
        const minSupportedVersion = info.minSupportedVersion;
        const latestVersionCode = Number(info.latestVersionCode || 0);
        const minSupportedVersionCode = Number(info.minSupportedVersionCode || 0);
        const storeUrl = info.playStoreUrl;
        const packageName = info.packageName;

        const currentVersion = Constants?.expoConfig?.version || '0.0.0';
        const currentNativeBuildVersion = Number.parseInt(Constants?.nativeBuildVersion || '0', 10) || 0;
        const currentVersionCode = currentNativeBuildVersion || Number(
          Constants?.expoConfig?.android?.versionCode
          || Constants?.manifest2?.extra?.expoClient?.android?.versionCode
          || 0
        );

        const hasNewVersion = latestVersion
          ? compareVersion(currentVersion, latestVersion) < 0
          : (latestVersionCode > 0 && currentVersionCode > 0 && currentVersionCode < latestVersionCode);

        const requiresHardUpdate = minSupportedVersion
          ? compareVersion(currentVersion, minSupportedVersion) < 0
          : (minSupportedVersionCode > 0 && currentVersionCode > 0 && currentVersionCode < minSupportedVersionCode);

        if (!hasNewVersion && !requiresHardUpdate) return;

        const message = requiresHardUpdate
          ? 'Potrebno je ažurirati aplikaciju za nastavak korištenja.'
          : 'Dostupna je nova verzija aplikacije. Želite li ažurirati sada?';

        if (requiresHardUpdate) {
          Alert.alert('Obavezno ažuriranje', message, [
            {
              text: 'Ažuriraj',
              onPress: () => openStore(storeUrl, packageName),
            },
          ], { cancelable: false });
          return;
        }

        Alert.alert('Dostupna nova verzija', message, [
          { text: 'Kasnije', style: 'cancel' },
          {
            text: 'Ažuriraj',
            onPress: () => openStore(storeUrl, packageName),
          },
        ]);
      } catch (err) {
        console.log('ℹ️ Update check preskočen:', err?.message || 'n/a');
      }
    };

    checkForUpdate();
  }, []);

  const handleDismissTip = () => setShowTip(false);

  return (
    <AuthProvider>
      <Navigation />
      {showTip && tip ? (
        <TouchableOpacity
          onPress={handleDismissTip}
          activeOpacity={0.9}
          style={[styles.tipContainer, { bottom: (insets?.bottom || 0) + 16 }]}
        >
          <View style={styles.tipBubble}>
            <Text style={styles.tipText}>{tip}</Text>
            <Text style={styles.tipHint}>Dodirni za zatvaranje</Text>
          </View>
        </TouchableOpacity>
      ) : null}
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  tipContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 99,
  },
  tipBubble: {
    backgroundColor: '#7f1d1d',
    borderWidth: 1,
    borderColor: '#991b1b',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  tipText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  tipHint: {
    marginTop: 8,
    color: '#fde8e8',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});
