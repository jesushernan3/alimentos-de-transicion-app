import type { Recipe } from "./types";

/**
 * Recetas de desayuno y merienda.
 *
 * Este contenido es editorial de demostración: las cantidades están expresadas
 * para la cantidad de porciones indicada en `portions` y se reescalan en la app.
 * `nutrition` sólo se completa cuando existen valores estimados coherentes con
 * los ingredientes; de lo contrario queda en `null`.
 */
export const RECIPES_PART_1: Recipe[] = [
  {
    id: "r-001",
    slug: "porridge-de-avena-con-manzana-y-canela",
    title: "Porridge de avena con manzana y canela",
    description:
      "Un desayuno tibio y reconfortante que se cocina en una sola olla. La manzana aporta dulzor natural y la canela ese aroma de cocina de domingo.",
    image: "recipe-porridge-avena-manzana",
    prepTime: 5,
    cookingTime: 10,
    totalTime: 15,
    difficulty: "facil",
    portions: 2,
    category: "desayuno",
    dietTags: ["vegetariana", "sin-azucar"],
    ingredients: [
      { ingredientId: "avena", quantity: 100, unit: "g" },
      { ingredientId: "leche", quantity: 400, unit: "ml" },
      { ingredientId: "manzana", quantity: 1, unit: "unidad", note: "en cubos" },
      { ingredientId: "canela", quantity: 1, unit: "cdta" },
      { ingredientId: "nueces", quantity: 20, unit: "g", note: "picadas" },
      { ingredientId: "miel", quantity: 1, unit: "cda", note: "opcional" },
      { ingredientId: "sal", quantity: null, unit: "a-gusto" },
    ],
    steps: [
      {
        stepNumber: 1,
        description:
          "Colocá la avena, la leche y una pizca de sal en una olla mediana a fuego medio.",
      },
      {
        stepNumber: 2,
        description:
          "Cociná de 6 a 8 minutos revolviendo cada tanto, hasta que la avena se hidrate y la preparación espese.",
      },
      {
        stepNumber: 3,
        description:
          "Sumá la manzana en cubos y la canela, y cociná 2 minutos más para que la fruta se ablande apenas.",
      },
      {
        stepNumber: 4,
        description:
          "Serví en dos boles, terminá con las nueces picadas y, si querés, un hilo de miel.",
      },
    ],
    nutrition: { calories: 340, protein: 12, carbs: 52, fat: 9, fiber: 7 },
    featured: true,
    communitySaves: 1840,
    tips: "Si te gusta más cremoso, dejá reposar el porridge tapado 3 minutos antes de servir.",
    createdAt: "2026-01-12",
  },
  {
    id: "r-002",
    slug: "budin-de-banana",
    title: "Budín de banana",
    description:
      "Húmedo, dulce por la fruta madura y sin azúcar añadida. Ideal para tener listo el domingo y estirarlo durante la semana.",
    image: "recipe-budin-banana",
    prepTime: 15,
    cookingTime: 40,
    totalTime: 55,
    difficulty: "intermedia",
    portions: 8,
    category: "merienda",
    dietTags: ["vegetariana", "sin-azucar"],
    ingredients: [
      { ingredientId: "banana", quantity: 3, unit: "unidad", note: "bien maduras" },
      { ingredientId: "huevo", quantity: 2, unit: "unidad" },
      { ingredientId: "avena", quantity: 150, unit: "g" },
      { ingredientId: "harina-integral", quantity: 100, unit: "g" },
      { ingredientId: "aceite-oliva", quantity: 3, unit: "cda" },
      { ingredientId: "polvo-hornear", quantity: 2, unit: "cdta" },
      { ingredientId: "canela", quantity: 1, unit: "cdta" },
      { ingredientId: "esencia-vainilla", quantity: 1, unit: "cdta" },
      { ingredientId: "nueces", quantity: 40, unit: "g" },
    ],
    steps: [
      { stepNumber: 1, description: "Precalentá el horno a 180 °C y forrá un molde de budín con papel manteca." },
      { stepNumber: 2, description: "Pisá las bananas con un tenedor hasta obtener un puré con algunos grumos." },
      {
        stepNumber: 3,
        description:
          "Incorporá los huevos, el aceite y la vainilla, y mezclá con batidor de mano hasta integrar.",
      },
      {
        stepNumber: 4,
        description:
          "Sumá la avena, la harina integral, el polvo para hornear y la canela. Mezclá con espátula sin batir de más.",
      },
      { stepNumber: 5, description: "Agregá las nueces, volcá en el molde y alisá la superficie." },
      {
        stepNumber: 6,
        description:
          "Horneá 40 minutos o hasta que al insertar un palillo en el centro salga seco. Dejá enfriar antes de desmoldar.",
      },
    ],
    nutrition: { calories: 245, protein: 7, carbs: 33, fat: 9, fiber: 5 },
    featured: true,
    communitySaves: 2310,
    tips: "Cuanto más maduras las bananas, más dulce queda el budín sin necesidad de endulzantes.",
    createdAt: "2026-01-14",
  },
  {
    id: "r-003",
    slug: "panqueques-de-avena-y-zanahoria",
    title: "Panqueques de avena y zanahoria",
    description:
      "Panqueques suaves con zanahoria rallada que suman verdura al desayuno casi sin que se note. Se hacen en sartén, sin horno.",
    image: "recipe-panqueques-avena-zanahoria",
    prepTime: 10,
    cookingTime: 12,
    totalTime: 22,
    difficulty: "facil",
    portions: 2,
    category: "desayuno",
    dietTags: ["vegetariana", "sin-azucar"],
    ingredients: [
      { ingredientId: "avena", quantity: 80, unit: "g" },
      { ingredientId: "zanahoria", quantity: 1, unit: "unidad", note: "rallada fina" },
      { ingredientId: "huevo", quantity: 2, unit: "unidad" },
      { ingredientId: "leche", quantity: 100, unit: "ml" },
      { ingredientId: "polvo-hornear", quantity: 1, unit: "cdta" },
      { ingredientId: "canela", quantity: 1, unit: "cdta" },
      { ingredientId: "yogur-natural", quantity: 100, unit: "g", note: "para servir" },
    ],
    steps: [
      {
        stepNumber: 1,
        description:
          "Procesá la avena unos segundos hasta obtener una harina gruesa, o usá avena instantánea.",
      },
      {
        stepNumber: 2,
        description:
          "Mezclá la avena con los huevos, la leche, el polvo para hornear y la canela hasta lograr una mezcla espesa.",
      },
      { stepNumber: 3, description: "Incorporá la zanahoria rallada y dejá reposar 5 minutos." },
      {
        stepNumber: 4,
        description:
          "Cociná cucharadas de mezcla en sartén antiadherente a fuego medio, 2 minutos por lado, hasta dorar.",
      },
      { stepNumber: 5, description: "Serví apilados con una cucharada de yogur natural encima." },
    ],
    nutrition: { calories: 310, protein: 16, carbs: 38, fat: 10, fiber: 6 },
    featured: false,
    communitySaves: 980,
    createdAt: "2026-01-16",
  },
  {
    id: "r-004",
    slug: "yogur-vegetal-con-semillas",
    title: "Yogur vegetal con semillas",
    description:
      "Un desayuno o snack que se arma en tres minutos. Las semillas aportan textura y grasas buenas, y la fruta fresca completa el bol.",
    image: "recipe-yogur-vegetal-semillas",
    prepTime: 5,
    cookingTime: 0,
    totalTime: 5,
    difficulty: "facil",
    portions: 1,
    category: "snack",
    dietTags: ["vegana", "vegetariana", "sin-tacc", "sin-azucar"],
    ingredients: [
      { ingredientId: "yogur-vegetal", quantity: 200, unit: "g" },
      { ingredientId: "semillas-chia", quantity: 1, unit: "cda" },
      { ingredientId: "semillas-calabaza", quantity: 1, unit: "cda" },
      { ingredientId: "semillas-girasol", quantity: 1, unit: "cda" },
      { ingredientId: "arandanos", quantity: 40, unit: "g" },
    ],
    steps: [
      { stepNumber: 1, description: "Colocá el yogur vegetal en un frasco o bol." },
      { stepNumber: 2, description: "Sumá las semillas de chía, calabaza y girasol por encima." },
      { stepNumber: 3, description: "Terminá con los arándanos y consumí en el momento." },
    ],
    nutrition: null,
    featured: false,
    communitySaves: 640,
    tips: "Si lo preparás la noche anterior, la chía absorbe líquido y el yogur queda más espeso.",
    createdAt: "2026-01-18",
  },
  {
    id: "r-005",
    slug: "galletitas-de-avena-y-coco",
    title: "Galletitas de avena y coco",
    description:
      "Crocantes por fuera y tiernas por dentro. Se hacen con pocos ingredientes y son perfectas para acompañar el té.",
    image: "recipe-galletitas-avena-coco",
    prepTime: 15,
    cookingTime: 15,
    totalTime: 30,
    difficulty: "facil",
    portions: 12,
    category: "merienda",
    dietTags: ["vegetariana"],
    ingredients: [
      { ingredientId: "avena", quantity: 180, unit: "g" },
      { ingredientId: "coco-rallado", quantity: 60, unit: "g" },
      { ingredientId: "banana", quantity: 2, unit: "unidad", note: "maduras" },
      { ingredientId: "aceite-oliva", quantity: 2, unit: "cda" },
      { ingredientId: "miel", quantity: 2, unit: "cda" },
      { ingredientId: "esencia-vainilla", quantity: 1, unit: "cdta" },
      { ingredientId: "sal", quantity: null, unit: "a-gusto" },
    ],
    steps: [
      { stepNumber: 1, description: "Precalentá el horno a 175 °C y prepará una placa con papel manteca." },
      { stepNumber: 2, description: "Pisá las bananas y mezclá con el aceite, la miel y la vainilla." },
      {
        stepNumber: 3,
        description:
          "Incorporá la avena, el coco rallado y una pizca de sal. Mezclá hasta obtener una masa que se pueda moldear.",
      },
      {
        stepNumber: 4,
        description:
          "Formá bollitos, apoyalos en la placa y achatalos suavemente con la palma de la mano.",
      },
      { stepNumber: 5, description: "Horneá 15 minutos hasta que los bordes estén dorados. Dejá enfriar sobre rejilla." },
    ],
    nutrition: null,
    featured: false,
    communitySaves: 1120,
    createdAt: "2026-01-20",
  },
  {
    id: "r-006",
    slug: "avena-nocturna-con-frutos-rojos",
    title: "Avena nocturna con frutos rojos",
    description:
      "Se prepara la noche anterior y a la mañana está lista. Ideal para días en los que no hay tiempo de cocinar nada.",
    image: "recipe-avena-nocturna-frutos-rojos",
    prepTime: 10,
    cookingTime: 0,
    totalTime: 10,
    difficulty: "facil",
    portions: 1,
    category: "desayuno",
    dietTags: ["vegetariana", "sin-azucar"],
    ingredients: [
      { ingredientId: "avena", quantity: 60, unit: "g" },
      { ingredientId: "yogur-natural", quantity: 120, unit: "g" },
      { ingredientId: "leche", quantity: 100, unit: "ml" },
      { ingredientId: "semillas-chia", quantity: 1, unit: "cda" },
      { ingredientId: "frutos-rojos", quantity: 80, unit: "g" },
      { ingredientId: "esencia-vainilla", quantity: 1, unit: "cdta" },
    ],
    steps: [
      {
        stepNumber: 1,
        description:
          "En un frasco con tapa, mezclá la avena, el yogur, la leche, la chía y la vainilla.",
      },
      { stepNumber: 2, description: "Tapá y dejá en la heladera al menos 6 horas o toda la noche." },
      {
        stepNumber: 3,
        description:
          "A la mañana, revolvé, sumá los frutos rojos por encima y, si quedó muy espeso, agregá un chorrito de leche.",
      },
    ],
    nutrition: { calories: 330, protein: 15, carbs: 45, fat: 8, fiber: 9 },
    featured: true,
    communitySaves: 2040,
    tips: "Preparate tres frascos el domingo y tenés el desayuno resuelto de lunes a miércoles.",
    createdAt: "2026-01-22",
  },
  {
    id: "r-007",
    slug: "licuado-de-mango-y-curcuma",
    title: "Licuado de mango y cúrcuma",
    description:
      "Fresco, cremoso y de color intenso. La cúrcuma aporta un fondo especiado que combina muy bien con el dulzor del mango.",
    image: "recipe-licuado-mango-curcuma",
    prepTime: 7,
    cookingTime: 0,
    totalTime: 7,
    difficulty: "facil",
    portions: 2,
    category: "bebida",
    dietTags: ["vegana", "vegetariana", "sin-tacc", "sin-azucar"],
    ingredients: [
      { ingredientId: "mango", quantity: 1, unit: "unidad", note: "maduro, en cubos" },
      { ingredientId: "banana", quantity: 1, unit: "unidad" },
      { ingredientId: "bebida-almendras", quantity: 300, unit: "ml" },
      { ingredientId: "curcuma", quantity: 1, unit: "cdta" },
      { ingredientId: "jengibre", quantity: 5, unit: "g", note: "rallado" },
      { ingredientId: "hielo", quantity: 1, unit: "taza" },
    ],
    steps: [
      { stepNumber: 1, description: "Pelá y cortá el mango y la banana en trozos." },
      {
        stepNumber: 2,
        description:
          "Licuá la fruta con la bebida de almendras, la cúrcuma y el jengibre hasta que quede bien liso.",
      },
      { stepNumber: 3, description: "Sumá el hielo, licuá 20 segundos más y servís en dos vasos altos." },
    ],
    nutrition: null,
    featured: false,
    communitySaves: 870,
    tips: "Congelá el mango en cubos y podés saltear el hielo: queda más cremoso.",
    createdAt: "2026-01-24",
  },
  {
    id: "r-008",
    slug: "muffins-de-zanahoria-y-manzana",
    title: "Muffins de zanahoria y manzana",
    description:
      "Muffins húmedos con verdura y fruta rallada. Aguantan tres días en un frasco cerrado y viajan bien en la mochila.",
    image: "recipe-muffins-zanahoria-manzana",
    prepTime: 20,
    cookingTime: 25,
    totalTime: 45,
    difficulty: "intermedia",
    portions: 10,
    category: "merienda",
    dietTags: ["vegetariana", "sin-azucar"],
    ingredients: [
      { ingredientId: "zanahoria", quantity: 2, unit: "unidad", note: "ralladas" },
      { ingredientId: "manzana", quantity: 1, unit: "unidad", note: "rallada" },
      { ingredientId: "huevo", quantity: 2, unit: "unidad" },
      { ingredientId: "harina-integral", quantity: 180, unit: "g" },
      { ingredientId: "avena", quantity: 60, unit: "g" },
      { ingredientId: "aceite-oliva", quantity: 4, unit: "cda" },
      { ingredientId: "polvo-hornear", quantity: 2, unit: "cdta" },
      { ingredientId: "canela", quantity: 2, unit: "cdta" },
      { ingredientId: "pasas", quantity: 40, unit: "g" },
    ],
    steps: [
      { stepNumber: 1, description: "Precalentá el horno a 180 °C y colocá pirotines en un molde de muffins." },
      { stepNumber: 2, description: "Batí los huevos con el aceite hasta que se integren." },
      { stepNumber: 3, description: "Sumá la zanahoria y la manzana ralladas y mezclá." },
      {
        stepNumber: 4,
        description:
          "Incorporá la harina, la avena, el polvo para hornear y la canela. Mezclá lo justo y agregá las pasas.",
      },
      { stepNumber: 5, description: "Repartí en los pirotines llenando tres cuartos de cada uno." },
      { stepNumber: 6, description: "Horneá 25 minutos hasta que estén firmes y dorados. Dejá templar antes de comer." },
    ],
    nutrition: null,
    featured: false,
    communitySaves: 1350,
    createdAt: "2026-01-26",
  },
  {
    id: "r-009",
    slug: "tostadas-de-palta-con-huevo",
    title: "Tostadas de palta con huevo",
    description:
      "El clásico que nunca falla: pan integral, palta cremosa y un huevo poché de yema tierna. Desayuno o cena rápida.",
    image: "recipe-tostadas-palta-huevo",
    prepTime: 5,
    cookingTime: 8,
    totalTime: 13,
    difficulty: "facil",
    portions: 2,
    category: "desayuno",
    dietTags: ["vegetariana", "alta-proteina"],
    ingredients: [
      { ingredientId: "pan-integral", quantity: 2, unit: "unidad", note: "rebanadas" },
      { ingredientId: "palta", quantity: 1, unit: "unidad", note: "madura" },
      { ingredientId: "huevo", quantity: 2, unit: "unidad" },
      { ingredientId: "limon", quantity: 1, unit: "unidad", note: "sólo el jugo" },
      { ingredientId: "aji-molido", quantity: null, unit: "a-gusto" },
      { ingredientId: "sal", quantity: null, unit: "a-gusto" },
      { ingredientId: "pimienta", quantity: null, unit: "a-gusto" },
    ],
    steps: [
      { stepNumber: 1, description: "Tostá el pan integral hasta que esté bien crocante." },
      {
        stepNumber: 2,
        description:
          "Pisá la palta con jugo de limón, sal y pimienta hasta obtener una crema con textura.",
      },
      {
        stepNumber: 3,
        description:
          "Cociná los huevos poché en agua apenas hirviendo con un chorrito de vinagre, 3 minutos.",
      },
      {
        stepNumber: 4,
        description:
          "Untá la palta sobre las tostadas, apoyá el huevo encima y terminá con ají molido y pimienta.",
      },
    ],
    nutrition: { calories: 380, protein: 17, carbs: 28, fat: 22, fiber: 8 },
    featured: true,
    communitySaves: 2760,
    createdAt: "2026-01-28",
  },
  {
    id: "r-010",
    slug: "parfait-de-yogur-granola-y-frutillas",
    title: "Parfait de yogur, granola y frutillas",
    description:
      "Capas de yogur, granola crocante y frutilla fresca en un vaso. Se ve lindo y se arma en cinco minutos.",
    image: "recipe-parfait-yogur-granola",
    prepTime: 8,
    cookingTime: 0,
    totalTime: 8,
    difficulty: "facil",
    portions: 2,
    category: "merienda",
    dietTags: ["vegetariana", "alta-proteina"],
    ingredients: [
      { ingredientId: "yogur-griego", quantity: 300, unit: "g" },
      { ingredientId: "granola", quantity: 80, unit: "g" },
      { ingredientId: "frutillas", quantity: 150, unit: "g", note: "en láminas" },
      { ingredientId: "miel", quantity: 1, unit: "cda", note: "opcional" },
      { ingredientId: "menta", quantity: 1, unit: "puñado", note: "para decorar" },
    ],
    steps: [
      { stepNumber: 1, description: "Lavá y cortá las frutillas en láminas finas." },
      {
        stepNumber: 2,
        description:
          "En dos vasos, alterná capas de yogur, granola y frutillas hasta llegar al borde.",
      },
      { stepNumber: 3, description: "Terminá con granola, un hilo de miel y una hoja de menta." },
    ],
    nutrition: { calories: 320, protein: 18, carbs: 40, fat: 9, fiber: 5 },
    featured: false,
    communitySaves: 1580,
    tips: "Armalo justo antes de servir para que la granola no pierda el crocante.",
    createdAt: "2026-01-30",
  },
  {
    id: "r-011",
    slug: "muffins-salados-de-espinaca-y-avena",
    title: "Muffins salados de espinaca y avena",
    description:
      "Una opción salada para la tarde o para llevar al trabajo. Rinden mucho y se congelan sin problema.",
    image: "recipe-muffins-salados-espinaca",
    prepTime: 20,
    cookingTime: 25,
    totalTime: 45,
    difficulty: "intermedia",
    portions: 10,
    category: "snack",
    dietTags: ["vegetariana", "alta-proteina"],
    ingredients: [
      { ingredientId: "espinaca", quantity: 200, unit: "g" },
      { ingredientId: "avena", quantity: 150, unit: "g" },
      { ingredientId: "huevo", quantity: 3, unit: "unidad" },
      { ingredientId: "queso-rallado", quantity: 60, unit: "g" },
      { ingredientId: "leche", quantity: 120, unit: "ml" },
      { ingredientId: "cebolla", quantity: 1, unit: "unidad", note: "picada fina" },
      { ingredientId: "polvo-hornear", quantity: 1, unit: "cdta" },
      { ingredientId: "aceite-oliva", quantity: 2, unit: "cda" },
      { ingredientId: "sal", quantity: null, unit: "a-gusto" },
      { ingredientId: "pimienta", quantity: null, unit: "a-gusto" },
    ],
    steps: [
      { stepNumber: 1, description: "Precalentá el horno a 180 °C y aceitá un molde de muffins." },
      {
        stepNumber: 2,
        description:
          "Salteá la cebolla en el aceite de oliva 4 minutos y sumá la espinaca hasta que reduzca. Dejá templar.",
      },
      { stepNumber: 3, description: "Batí los huevos con la leche, la sal y la pimienta." },
      {
        stepNumber: 4,
        description:
          "Incorporá la avena, el queso rallado, el polvo para hornear y el salteado de verduras.",
      },
      { stepNumber: 5, description: "Repartí en el molde y horneá 25 minutos hasta que estén firmes y dorados." },
    ],
    nutrition: null,
    featured: false,
    communitySaves: 910,
    createdAt: "2026-02-01",
  },
  {
    id: "r-012",
    slug: "pancakes-de-manzana-y-canela",
    title: "Pancakes de manzana y canela",
    description:
      "Esponjosos, con manzana caramelizada arriba. Un desayuno de fin de semana que igual entra en la rutina saludable.",
    image: "recipe-pancakes-manzana-canela",
    prepTime: 12,
    cookingTime: 12,
    totalTime: 24,
    difficulty: "facil",
    portions: 3,
    category: "desayuno",
    dietTags: ["vegetariana"],
    ingredients: [
      { ingredientId: "harina-integral", quantity: 150, unit: "g" },
      { ingredientId: "huevo", quantity: 2, unit: "unidad" },
      { ingredientId: "leche", quantity: 200, unit: "ml" },
      { ingredientId: "manzana", quantity: 2, unit: "unidad", note: "en gajos finos" },
      { ingredientId: "polvo-hornear", quantity: 2, unit: "cdta" },
      { ingredientId: "canela", quantity: 2, unit: "cdta" },
      { ingredientId: "miel", quantity: 2, unit: "cda" },
      { ingredientId: "manteca", quantity: 10, unit: "g" },
    ],
    steps: [
      {
        stepNumber: 1,
        description:
          "Mezclá la harina, el polvo para hornear y una cucharadita de canela en un bol.",
      },
      {
        stepNumber: 2,
        description:
          "Agregá los huevos y la leche, y batí hasta obtener una mezcla lisa y espesa. Dejá reposar 5 minutos.",
      },
      {
        stepNumber: 3,
        description:
          "Salteá los gajos de manzana con la manteca, la miel y el resto de la canela hasta que se doren.",
      },
      {
        stepNumber: 4,
        description:
          "Cociná los pancakes en sartén antiadherente a fuego medio, 2 minutos por lado, hasta que burbujeen y doren.",
      },
      { stepNumber: 5, description: "Apilá los pancakes y coroná con la manzana caramelizada y su jugo." },
    ],
    nutrition: null,
    featured: false,
    communitySaves: 1690,
    createdAt: "2026-02-03",
  },
  {
    id: "r-013",
    slug: "huevos-revueltos-con-espinaca-y-tomate",
    title: "Huevos revueltos con espinaca y tomate",
    description:
      "Diez minutos, una sartén y mucha proteína. El truco está en cocinar los huevos a fuego bajo para que queden cremosos.",
    image: "recipe-huevos-revueltos-espinaca",
    prepTime: 5,
    cookingTime: 7,
    totalTime: 12,
    difficulty: "facil",
    portions: 2,
    category: "desayuno",
    dietTags: ["vegetariana", "sin-tacc", "alta-proteina", "baja-carbohidratos"],
    ingredients: [
      { ingredientId: "huevo", quantity: 4, unit: "unidad" },
      { ingredientId: "espinaca", quantity: 100, unit: "g" },
      { ingredientId: "tomate-cherry", quantity: 150, unit: "g", note: "por mitades" },
      { ingredientId: "aceite-oliva", quantity: 1, unit: "cda" },
      { ingredientId: "sal", quantity: null, unit: "a-gusto" },
      { ingredientId: "pimienta", quantity: null, unit: "a-gusto" },
    ],
    steps: [
      {
        stepNumber: 1,
        description:
          "Calentá el aceite en una sartén y salteá los tomates cherry 2 minutos hasta que empiecen a soltar jugo.",
      },
      { stepNumber: 2, description: "Sumá la espinaca y cociná 1 minuto, sólo hasta que se marchite." },
      { stepNumber: 3, description: "Batí los huevos con sal y pimienta y volcalos en la sartén." },
      {
        stepNumber: 4,
        description:
          "Bajá el fuego y revolvé suavemente con espátula hasta que los huevos cuajen pero sigan cremosos.",
      },
    ],
    nutrition: { calories: 290, protein: 21, carbs: 8, fat: 20, fiber: 3 },
    featured: false,
    communitySaves: 1240,
    createdAt: "2026-02-05",
  },
  {
    id: "r-014",
    slug: "smoothie-bowl-de-frutos-rojos",
    title: "Smoothie bowl de frutos rojos",
    description:
      "Un bol espeso que se come con cuchara, con toppings crocantes. Refrescante y muy fácil de personalizar.",
    image: "recipe-smoothie-bowl",
    prepTime: 10,
    cookingTime: 0,
    totalTime: 10,
    difficulty: "facil",
    portions: 1,
    category: "desayuno",
    dietTags: ["vegetariana", "sin-tacc", "sin-azucar"],
    ingredients: [
      { ingredientId: "frutos-rojos", quantity: 150, unit: "g", note: "congelados" },
      { ingredientId: "banana", quantity: 1, unit: "unidad", note: "congelada" },
      { ingredientId: "yogur-natural", quantity: 100, unit: "g" },
      { ingredientId: "granola", quantity: 30, unit: "g" },
      { ingredientId: "coco-rallado", quantity: 10, unit: "g" },
      { ingredientId: "semillas-chia", quantity: 1, unit: "cda" },
    ],
    steps: [
      {
        stepNumber: 1,
        description:
          "Licuá los frutos rojos y la banana congelados con el yogur, usando poco líquido para que quede bien espeso.",
      },
      { stepNumber: 2, description: "Volcá la mezcla en un bol y alisá la superficie con el dorso de una cuchara." },
      { stepNumber: 3, description: "Decorá en hileras con granola, coco rallado y semillas de chía." },
    ],
    nutrition: null,
    featured: true,
    communitySaves: 1970,
    tips: "Si la licuadora se traba, agregá una cucharada de yogur en lugar de agua para no perder textura.",
    createdAt: "2026-02-07",
  },
];
