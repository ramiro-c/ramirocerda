import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { config } from "@/config";
import { signOgImageUrl } from "@/lib/og-image";
import Markdown from "react-markdown";

const content = `## Sobre mí

Hola, soy Ramiro, un amante de los libros, la ciencia ficción y la naturaleza. Me dedico a ser desarrollador de software y soy ingeniero. Este es mi pequeño rincón digital, donde voy dejando un registro de mis experimentos, descubrimientos y reflexiones.

En Bitácora encontrarás trozos de mi día a día como desarrollador, desde desafíos técnicos hasta curiosidades o rejuntes de posts interesantes. También me gusta hablar de mis viajes y libros que me han marcado o reflexiones derivadas de ellos.

*"No tienes que quemar libros para destruir una cultura. Sólo hace falta que la gente deje de leerlos."*

Este blog es como un diario en el que cada página cuenta algo nuevo. Si alguna de mis ideas te resuena o te genera curiosidad, no dudes en comentar o ponerte en contacto.

Bienvenido a Bitácora, *"Lo importante no es mantenerse vivo, sino mantenerse humano."*
`;

export async function generateMetadata() {
  return {
    title: "Sobre mí",
    description: "Aprende más sobre Ramiro Cerdá y su vida",
    openGraph: {
      title: "Sobre mí",
      description: "Aprende más sobre Ramiro Cerdá y su vida",
      images: [
        signOgImageUrl({
          title: "Ramiro Cerdá",
          label: "Sobre mí",
          brand: config.blog.name,
        }),
      ],
    },
  };
}

const Page = async () => {
  return (
    <div className="container mx-auto px-5">
      <Header />
      <div className="prose lg:prose-lg dark:prose-invert m-auto mt-20 mb-10 blog-content">
        <Markdown>{content}</Markdown>
      </div>
      <Footer />
    </div>
  );
};

export default Page;
