export interface DeptMemberInfo {
  email: string;
  name: string;
  contactNumber?: string;
  age?: string;
  gender?: string;
  role?: string;
  stream?: string;
}

const rows: DeptMemberInfo[] = [
  { email: "24f2007471@ds.study.iitm.ac.in", name: "Deeksha", contactNumber: "6381182945", gender: "Female", role: "Coordinator", stream: "Data Science & Applications" },
  { email: "25f2005275@ds.study.iitm.ac.in", name: "RAKSHITH A V R", contactNumber: "8300066003", age: "18", gender: "Male", role: "Coordinator", stream: "Data Science & Applications" },
  { email: "24f3100051@es.study.iitm.ac.in", name: "Khwaish tyagi", contactNumber: "8810234149", age: "19", gender: "Female", role: "Coordinator", stream: "Electronic Systems" },
  { email: "25f1002825@ds.study.iitm.ac.in", name: "Gourav Vyas", contactNumber: "8800523418", age: "20", gender: "Male", role: "Coordinator", stream: "Data Science & Applications" },
  { email: "24f3100093@es.study.iitm.ac.in", name: "ANURAG SHARMA", contactNumber: "7061954624", age: "22", gender: "Male", role: "Coordinator", stream: "Electronic Systems" },
  { email: "25f2001196@ds.study.iitm.ac.in", name: "Aishwarya Shashikant Mhaishalkar", contactNumber: "8956705013", age: "20", gender: "Female", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f3003369@ds.study.iitm.ac.in", name: "Hritik Kumar Roushan", contactNumber: "6200672315", age: "21", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "23f3002381@ds.study.iitm.ac.in", name: "DUDDE JASMITHA", contactNumber: "9347775934", age: "19", gender: "Female", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "23f2004901@ds.study.iitm.ac.in", name: "Charmika Mannam", contactNumber: "7569968433", age: "20", gender: "Female", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f3002105@ds.study.iitm.ac.in", name: "Abhay Shukla", contactNumber: "7379814326", age: "21", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f2000490@ds.study.iitm.ac.in", name: "Gopal Krishna Sharma", contactNumber: "7357567784", age: "19", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f1001943@ds.study.iitm.ac.in", name: "Sanjana", contactNumber: "9880396368", age: "19", gender: "Female", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f2004660@ds.study.iitm.ac.in", name: "Ashutosh Ray Mohapatra", contactNumber: "8144038307", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f2002110@ds.study.iitm.ac.in", name: "AMRUTANSHU SAHOO", contactNumber: "9337346991", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f3005141@ds.study.iitm.ac.in", name: "Gagan", contactNumber: "8059580047", age: "19", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f3000516@ds.study.iitm.ac.in", name: "Deepak Kumar Jena", contactNumber: "9346316469", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f2006445@ds.study.iitm.ac.in", name: "Aryan Kumar", contactNumber: "7631825223", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "22f2001175@ds.study.iitm.ac.in", name: "Lakshika Sheoran", contactNumber: "9717118189", age: "22", gender: "Female", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f2006131@ds.study.iitm.ac.in", name: "Drishti Garg", contactNumber: "9651602468", age: "18", gender: "Female", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f1002578@ds.study.iitm.ac.in", name: "Rohan Jha", contactNumber: "8126181163", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f3005259@ds.study.iitm.ac.in", name: "Chandan kumar gurjar", contactNumber: "9549912969", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f2008840@ds.study.iitm.ac.in", name: "Manish Bisht", contactNumber: "6396266866", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f2006140@ds.study.iitm.ac.in", name: "Amresh Yadav", contactNumber: "7235069001", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "23f2004112@ds.study.iitm.ac.in", name: "Rishabh Barthwal", contactNumber: "7974620388", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f3005086@ds.study.iitm.ac.in", name: "Sameer mishra", contactNumber: "9720413710", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "23f1002643@ds.study.iitm.ac.in", name: "Saini Nirmal", contactNumber: "9352863308", age: "22", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f2008461@ds.study.iitm.ac.in", name: "Parth Dixit", contactNumber: "7055593941", age: "18", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "25f3005205@ds.study.iitm.ac.in", name: "Aditya Kumar", contactNumber: "9122907680", age: "20", gender: "Male", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "24f3001985@ds.study.iitm.ac.in", name: "Khushi", contactNumber: "9520591360", age: "21", gender: "Female", role: "Volunteer", stream: "Data Science & Applications" },
  { email: "23f3002449@ds.study.iitm.ac.in", name: "Nithish Lakshmanasamy", contactNumber: "8072099161", role: "Volunteer" },
  { email: "23f3000358@es.study.iitm.ac.in", name: "Abhishek Meena", contactNumber: "9468828681", gender: "Male", role: "Volunteer", stream: "Electronic Systems" },
];

export const deptMembersByEmail: Record<string, DeptMemberInfo> = rows.reduce((acc, row) => {
  acc[row.email.trim().toLowerCase()] = row;
  return acc;
}, {} as Record<string, DeptMemberInfo>);
