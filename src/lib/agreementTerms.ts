export type AgreementClause = {
  number: string
  title: string
  text: string
}

export type AgreementTermSection = {
  number: string
  title: string
  clauses: AgreementClause[]
}

export type AgreementDocumentTerms = {
  template_version: string
  governing_law: string
  standard_terms: AgreementTermSection[]
}

export type AgreementDocumentReference = {
  template_version: string
  governing_law: string
  standard_terms?: AgreementTermSection[]
}

export const agreementTemplateVersion = 'MRPI-RSP-2026.1'

export const agreementStandardTerms: AgreementTermSection[] = [
  {
    number: '1',
    title: 'Pembentukan dan dokumen kontrak',
    clauses: [
      {
        number: '1.1',
        title: 'Persetujuan mengikat',
        text: 'Perjanjian ini berkuat kuasa apabila ditandatangani atau diterima dengan jelas oleh pihak yang diberi kuasa bagi Kontraktor dan Pelanggan. Penerimaan boleh dibuat secara fizikal atau elektronik mengikut Klausa 7.3, dan hendaklah merujuk nombor perjanjian serta nombor revisi yang tepat.',
      },
      {
        number: '1.2',
        title: 'Dokumen kontrak dan keutamaan',
        text: 'Dokumen Kontrak terdiri daripada Perjanjian ini, Butiran Kontrak, skop kerja, Jadual Pembayaran, sebutharga diterima yang dirujuk, lukisan atau spesifikasi yang diluluskan secara bertulis, dan setiap Variation Order yang diluluskan. Jika terdapat percanggahan, Variation Order yang lebih baharu dan Terma Khusus yang nyata mengatasi dokumen terdahulu; selepas itu keutamaan diberi kepada Perjanjian ini, skop dan Jadual Pembayaran, sebutharga, kemudian lukisan atau spesifikasi.',
      },
      {
        number: '1.3',
        title: 'Rekod bertulis',
        text: 'Arahan, notis, tuntutan, kelulusan dan perubahan yang memberi kesan kepada skop, harga atau masa hendaklah direkod secara bertulis dan bertarikh. Perbincangan atau janji lisan tidak mengubah Dokumen Kontrak sehingga disahkan secara bertulis oleh kedua-dua pihak.',
      },
    ],
  },
  {
    number: '3',
    title: 'Harga kontrak dan pembayaran',
    clauses: [
      {
        number: '3.1',
        title: 'Harga Kontrak',
        text: 'Harga Kontrak ialah jumlah yang dinyatakan dalam Butiran Kontrak bagi skop yang dinyatakan. Apa-apa kerja, bahan, fi atau caj yang tidak termasuk secara nyata tidak dianggap termasuk melainkan dipersetujui melalui Variation Order atau dikehendaki oleh undang-undang dan dimaklumkan dengan dokumen sokongan.',
      },
      {
        number: '3.2',
        title: 'Tuntutan dan tarikh bayaran',
        text: 'Kontraktor boleh mengeluarkan invois apabila pencapaian berkaitan dalam Jadual Pembayaran telah dipenuhi. Pelanggan hendaklah membayar pada atau sebelum tarikh akhir yang dinyatakan dalam invois. Sebarang pertikaian terhadap tuntutan hendaklah diberi secara bertulis dengan alasan sebelum tarikh akhir, dan bahagian yang tidak dipertikaikan hendaklah tetap dibayar.',
      },
      {
        number: '3.3',
        title: 'Bayaran tidak mengesahkan kecacatan',
        text: 'Bayaran kemajuan tidak dengan sendirinya menjadi pengesahan bahawa semua kerja bebas daripada kecacatan dan tidak menjejaskan hak Pelanggan untuk meminta pembaikan yang dilindungi oleh Klausa 5.4.',
      },
      {
        number: '3.4',
        title: 'Kegagalan membayar',
        text: 'Jika jumlah yang tidak dipertikaikan masih belum dibayar selepas tarikh akhir, Kontraktor boleh memberikan notis bertulis sekurang-kurangnya tujuh (7) hari untuk Pelanggan membetulkan kegagalan itu. Jika masih gagal, Kontraktor boleh menggantung kerja secara munasabah. Tempoh siap hendaklah dilanjutkan bagi kesan sebenar penggantungan, dan kos mobilisasi semula yang munasabah hanya boleh dituntut jika direkod dan dipersetujui secara bertulis.',
      },
    ],
  },
  {
    number: '4',
    title: 'Pelaksanaan kerja dan tanggungjawab pihak',
    clauses: [
      {
        number: '4.1',
        title: 'Kewajipan Kontraktor',
        text: 'Kontraktor hendaklah melaksanakan kerja dengan kemahiran dan penjagaan yang munasabah, menggunakan bahan yang sesuai seperti dinyatakan, mematuhi undang-undang serta keperluan keselamatan yang terpakai, menjaga tapak secara munasabah, dan memaklumkan isu material yang diketahui semasa kerja.',
      },
      {
        number: '4.2',
        title: 'Kewajipan Pelanggan',
        text: 'Pelanggan hendaklah memberi akses tapak yang selamat pada masa yang dipersetujui, maklumat dan keputusan yang tepat pada masanya, bekalan utiliti yang dipersetujui, serta bayaran mengikut Jadual Pembayaran. Pelanggan hendaklah memastikan bahawa beliau ialah pemilik atau mempunyai kuasa untuk mengarahkan kerja di tapak.',
      },
      {
        number: '4.3',
        title: 'Kelulusan dan permit',
        text: 'Pelanggan bertanggungjawab mendapatkan persetujuan pemilik, pengurusan bangunan atau pihak berkepentingan lain melainkan skop menyatakan sebaliknya. Kontraktor bertanggungjawab terhadap pendaftaran, permit kerja atau pematuhan yang secara nyata berada dalam skopnya. Fi pihak berkuasa tidak termasuk kecuali dinyatakan.',
      },
      {
        number: '4.4',
        title: 'Pekerja dan subkontraktor',
        text: 'Kontraktor boleh menggunakan pekerja atau subkontraktor yang sesuai dan kekal bertanggungjawab terhadap kerja mereka. Pelanggan tidak boleh memberi arahan yang mengubah skop terus kepada pekerja atau subkontraktor; arahan tersebut hendaklah melalui wakil Kontraktor.',
      },
      {
        number: '4.5',
        title: 'Bahan dibekalkan Pelanggan',
        text: 'Bagi bahan atau kelengkapan yang dibekalkan Pelanggan, Pelanggan bertanggungjawab terhadap pemilihan, kesesuaian, keadaan, penghantaran dan waranti pengilangnya. Kontraktor tetap bertanggungjawab terhadap mutu pemasangan yang berada dalam skopnya dan hendaklah memaklumkan kecacatan nyata yang diketahui sebelum pemasangan jika munasabah untuk berbuat demikian.',
      },
    ],
  },
  {
    number: '5',
    title: 'Masa, penyiapan dan kecacatan',
    clauses: [
      {
        number: '5.1',
        title: 'Permulaan dan tempoh',
        text: 'Kerja bermula apabila Perjanjian diterima, bayaran permulaan yang dipersetujui diterima, akses tapak diberi, dan kelulusan atau maklumat penting tersedia, atau pada tarikh mula bertulis yang dipersetujui kemudian. Tempoh dalam Butiran Kontrak ialah sasaran munasabah dan tertakluk kepada pelanjutan masa di bawah Klausa 5.2.',
      },
      {
        number: '5.2',
        title: 'Kelewatan dan pelanjutan masa',
        text: 'Kontraktor berhak kepada pelanjutan masa yang munasabah bagi kelewatan di luar kawalan munasabahnya, termasuk perubahan diluluskan, kelewatan keputusan atau akses Pelanggan, bahan Pelanggan, keadaan tersembunyi, tindakan pihak berkuasa, cuaca luar biasa, gangguan utiliti atau kejadian luar jangka. Kontraktor hendaklah memberi notis bertulis secepat yang munasabah dengan sebab dan anggaran kesan masa. Pelanjutan masa tidak secara automatik mengubah harga.',
      },
      {
        number: '5.3',
        title: 'Siap praktikal dan serahan',
        text: 'Kerja dianggap siap secara praktikal apabila boleh digunakan bagi tujuan yang dimaksudkan walaupun masih terdapat kerja kecil yang tidak menjejaskan penggunaan tersebut. Kontraktor hendaklah memaklumkan penyiapan; kedua-dua pihak hendaklah merekod senarai baki atau kecacatan yang nyata dan tempoh munasabah untuk pembetulan.',
      },
      {
        number: '5.4',
        title: 'Kecacatan dan waranti',
        text: 'Tempoh dan skop liabiliti kecacatan adalah seperti dinyatakan dalam Terma Khusus. Setelah menerima notis bertulis yang munasabah, Kontraktor hendaklah membaiki kecacatan yang berpunca daripada mutu kerja atau bahan yang dibekalkannya. Perlindungan tidak meliputi haus biasa, salah guna, kegagalan penyelenggaraan, pergerakan atau keadaan struktur sedia ada, bahan Pelanggan, atau kerja pihak lain, kecuali setakat kerosakan itu berpunca daripada kecuaian atau pelanggaran Kontraktor.',
      },
      {
        number: '5.5',
        title: 'Kerosakan dan hak mandatori',
        text: 'Setiap pihak bertanggungjawab terhadap kerugian atau kerosakan yang berpunca daripada pelanggaran kontrak, kecuaian atau salah lakunya sendiri. Tiada klausa dalam Perjanjian ini mengecualikan liabiliti atau remedi yang tidak boleh dikecualikan di sisi undang-undang.',
      },
    ],
  },
  {
    number: '6',
    title: 'Perubahan, keadaan tersembunyi dan kejadian luar jangka',
    clauses: [
      {
        number: '6.1',
        title: 'Variation Order',
        text: 'Sebarang penambahan, pengurangan, penggantian atau perubahan kepada kerja hendaklah dinyatakan dalam Variation Order yang menerangkan skop, perubahan harga dan kesan masa, lalu diterima secara bertulis sebelum kerja perubahan bermula. Dalam kecemasan untuk melindungi nyawa atau harta, Kontraktor boleh mengambil langkah minimum yang munasabah dan hendaklah merekodkannya dengan segera.',
      },
      {
        number: '6.2',
        title: 'Keadaan tersembunyi',
        text: 'Keadaan fizikal yang tidak dapat dikenal pasti secara munasabah sebelum kerja, termasuk paip atau kabel tersembunyi, kerosakan struktur, anai-anai, kebocoran atau bahan berbahaya, tidak termasuk dalam Harga Kontrak melainkan dinyatakan. Kontraktor hendaklah menghentikan bahagian terjejas jika perlu, memaklumkan Pelanggan dan mengemukakan cadangan bertulis sebelum kerja tambahan diteruskan.',
      },
      {
        number: '6.3',
        title: 'Kejadian di luar kawalan',
        text: 'Tiada pihak dianggap melanggar Perjanjian setakat pelaksanaan terhalang oleh kejadian di luar kawalan munasabahnya, dengan syarat pihak terjejas memberi notis dan mengambil langkah munasabah untuk mengurangkan kesannya. Kewajipan membayar bagi kerja yang telah dilaksanakan tidak terhapus.',
      },
    ],
  },
  {
    number: '7',
    title: 'Penggantungan, penamatan dan notis',
    clauses: [
      {
        number: '7.1',
        title: 'Penamatan kerana kemungkiran',
        text: 'Jika satu pihak melakukan pelanggaran material dan gagal membetulkannya dalam tujuh (7) hari selepas notis bertulis yang menerangkan pelanggaran dan tindakan pembetulan, pihak yang tidak mungkir boleh menamatkan Perjanjian melalui notis bertulis. Jika pembetulan secara munasabah memerlukan tempoh lebih panjang dan telah dimulakan bersungguh-sungguh, pihak-pihak hendaklah memberi tempoh munasabah tambahan.',
      },
      {
        number: '7.2',
        title: 'Penyelesaian selepas penamatan',
        text: 'Selepas penamatan, tapak hendaklah diserahkan dengan selamat dan akaun akhir hendaklah mengambil kira nilai kerja yang dilaksanakan, bahan yang telah dihantar atau ditempah secara tidak boleh dibatalkan, Variation Order yang diluluskan, kos munasabah melindungi tapak dan mobilisasi keluar, serta semua bayaran yang telah dibuat. Hak menuntut kerugian yang dibenarkan undang-undang kekal terpelihara.',
      },
      {
        number: '7.3',
        title: 'Notis dan penerimaan elektronik',
        text: 'Notis boleh dihantar tangan, e-mel atau WhatsApp kepada alamat atau nombor yang dinyatakan dalam Dokumen Kontrak. Penerimaan melalui WhatsApp atau e-mel hanya direkod sebagai penerimaan apabila mesej mengenal pasti nombor perjanjian dan revisi serta menyatakan persetujuan dengan jelas; salinan mesej dan masa penghantaran hendaklah disimpan. Notis dianggap diterima apabila penghantaran atau akuan penerimaan dapat dibuktikan.',
      },
    ],
  },
  {
    number: '8',
    title: 'Pertikaian, undang-undang dan pentadbiran',
    clauses: [
      {
        number: '8.1',
        title: 'Penyelesaian pertikaian',
        text: 'Pihak-pihak hendaklah terlebih dahulu berunding dengan suci hati selama empat belas (14) hari selepas notis pertikaian. Jika tidak selesai, mereka boleh bersetuju menggunakan mediasi. Hak menggunakan adjudikasi di bawah undang-undang pembayaran pembinaan, jika dan setakat terpakai, atau membawa tuntutan ke tribunal atau mahkamah Malaysia yang mempunyai bidang kuasa tidak diketepikan.',
      },
      {
        number: '8.2',
        title: 'Undang-undang dan hak pengguna',
        text: 'Perjanjian ini ditadbir oleh undang-undang Malaysia. Jika Pelanggan ialah pengguna, tiada terma bertujuan mengehadkan jaminan, remedi atau bidang kuasa yang tidak boleh diketepikan di bawah undang-undang perlindungan pengguna atau undang-undang mandatori lain.',
      },
      {
        number: '8.3',
        title: 'Duti setem dan dokumen',
        text: 'Pihak-pihak hendaklah bekerjasama untuk mengemukakan, menaksir dan menyetem Perjanjian ini dalam tempoh yang ditetapkan undang-undang jika duti setem terpakai. Penentuan jenis instrumen, amaun duti dan pihak yang menanggungnya adalah tertakluk kepada undang-undang atau persetujuan bertulis pihak-pihak.',
      },
      {
        number: '8.4',
        title: 'Keseluruhan, kebolehpisahan dan pelepasan',
        text: 'Dokumen Kontrak merupakan keseluruhan persetujuan mengenai kerja ini. Jika mana-mana peruntukan tidak sah atau tidak boleh dikuatkuasakan, bahagian lain kekal berkuat kuasa setakat dibenarkan. Kegagalan atau kelewatan menggunakan sesuatu hak bukan pelepasan hak tersebut. Perjanjian boleh ditandatangani dalam beberapa salinan atau kaedah elektronik yang dibenarkan.',
      },
    ],
  },
]

export const legacyAgreementDocumentTerms: AgreementDocumentTerms = {
  template_version: 'MRPI-LEGACY-2026.0',
  governing_law: 'Malaysia',
  standard_terms: [
    {
      number: '3',
      title: 'Terma utama versi terdahulu',
      clauses: [
        { number: '3.1', title: 'Bayaran', text: 'Bayaran dibuat mengikut jadual pembayaran. Tahap pertama ialah bayaran permulaan yang akan diinvois dengan jumlah tetap seperti dinyatakan.' },
        { number: '3.2', title: 'Perubahan kerja', text: 'Sebarang perubahan skop atau harga selepas perjanjian diterima mesti direkod dan diluluskan melalui Variation Order sebelum dilaksanakan.' },
        { number: '3.3', title: 'Kerosakan tersembunyi', text: 'Kerosakan atau keadaan tersembunyi yang tidak termasuk dalam skop asal akan dinilai berasingan dan, jika melibatkan perubahan kerja atau harga, dikemukakan melalui Variation Order.' },
        { number: '3.4', title: 'Kemajuan kerja', text: 'Tarikh mula operasi projek ditetapkan secara berasingan selepas perjanjian diterima dan tidak berlaku secara automatik.' },
      ],
    },
  ],
}

export function currentAgreementDocumentTerms(): AgreementDocumentTerms {
  return {
    template_version: agreementTemplateVersion,
    governing_law: 'Malaysia',
    standard_terms: agreementStandardTerms,
  }
}

export function isAgreementDocumentTerms(value: unknown): value is AgreementDocumentTerms {
  if (!value || typeof value !== 'object') return false
  const document = value as Partial<AgreementDocumentTerms>
  return Boolean(
    typeof document.template_version === 'string'
    && typeof document.governing_law === 'string'
    && Array.isArray(document.standard_terms)
    && document.standard_terms.every((section) => (
      section
      && typeof section.number === 'string'
      && typeof section.title === 'string'
      && Array.isArray(section.clauses)
      && section.clauses.every((clause) => (
        clause
        && typeof clause.number === 'string'
        && typeof clause.title === 'string'
        && typeof clause.text === 'string'
      ))
    )),
  )
}

export function isAgreementDocumentReference(value: unknown): value is AgreementDocumentReference {
  if (!value || typeof value !== 'object') return false
  const document = value as Partial<AgreementDocumentReference>
  return typeof document.template_version === 'string' && typeof document.governing_law === 'string'
}

export function agreementDocumentTermsFromSnapshot(value: unknown): AgreementDocumentTerms | null {
  if (isAgreementDocumentTerms(value)) return value
  if (!isAgreementDocumentReference(value)) return null
  if (value.template_version === agreementTemplateVersion) return currentAgreementDocumentTerms()
  if (value.template_version === legacyAgreementDocumentTerms.template_version) return legacyAgreementDocumentTerms
  return null
}
