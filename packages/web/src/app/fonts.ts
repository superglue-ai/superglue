import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

//

export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const jetbrainsSans = localFont({
  src: "../../public/fonts/jetbrains-sans/JetBrainsSans.woff2",
  variable: "--font-jetbrains-sans",
});

