import { source, http } from '@/lib/api/httpClient';
import { getDb } from '@/lib/data/mockDb';
import { stockStatus } from '@/lib/domain/pricing';
import { CATEGORIES } from '@/lib/data/catalog';
import type { Paginated, Product } from '@/types/domain';

export interface ProductQuery {
  search?: string;
  category?: string;
  brands?: string[];
  stock?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name';
  page?: number;
  pageSize?: number;
}

export const productService = {
  getProducts: (q: ProductQuery = {}) =>
    source<Paginated<Product>>(() => {
      const s = q.search?.trim().toLowerCase() ?? '';
      let items = getDb().products.filter((p) =>
        (!s || [p.name, p.sku, p.brand, p.description, p.category].some((v) => v.toLowerCase().includes(s))) &&
        (!q.category || q.category === 'all' || p.category === q.category) &&
        (!q.brands?.length || q.brands.includes(p.brand)) &&
        (!q.stock || q.stock === 'all' || stockStatus(p) === q.stock));
      if (q.sort === 'price_asc') items = items.sort((a, b) => a.basePrice - b.basePrice);
      if (q.sort === 'price_desc') items = items.sort((a, b) => b.basePrice - a.basePrice);
      if (q.sort === 'name') items = items.sort((a, b) => a.name.localeCompare(b.name));
      const page = q.page ?? 1, pageSize = q.pageSize ?? 12;
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
    }, () => http.get('/products', { ...q, brands: q.brands?.join(',') })),
  getProduct: (id: string) =>
    source<Product>(() => { const p = getDb().products.find((x) => x.id === id); if (!p) throw new Error('Product not found'); return p; }, () => http.get(`/products/${id}`)),
  getAll: () => source<Product[]>(() => getDb().products, () => http.get('/products', { pageSize: 1000 }).then((r: any) => r.items)),
  getCategories: () => [...CATEGORIES],
  getBrands: () => [...new Set(getDb().products.map((p) => p.brand))].sort(),
};
